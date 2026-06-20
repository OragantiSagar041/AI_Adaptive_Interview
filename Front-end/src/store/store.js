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
  whitelist: ['role', 'token', 'adminUser', 'API_BASE_URL'] // only persist these fields
}

const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  dashboard: dashboardReducer,
  candidates: candidatesReducer,
  interview: interviewReducer,
  credits: creditsReducer
})

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE']
      }
    })
})

export const persistor = persistStore(store)
