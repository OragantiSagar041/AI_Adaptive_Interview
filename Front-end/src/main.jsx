import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { persistor, store } from './store/store'
import { loader } from '@monaco-editor/react'
import './index.css'
import App from './App.jsx'
import axios from 'axios'
import { logout } from './store/slices/authSlice'
import Swal from 'sweetalert2'
     
// Configure Monaco Editor loader to use high-availability CDN with worker support
loader.config({
  paths: {
    vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs',
  },
})

// Global Axios Interceptor for handling deactivated accounts
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.__hireIqAuthRedirecting) {
      const requestUrl = String(error.config?.url || error.response?.config?.url || '')

      // Never auto-redirect on login/auth endpoints — these 401s are handled
      // by the login form itself (e.g. wrong password, or master-login probe).
      const isLoginRoute = /\/(master|admin)\/(login|forgot-password|verify-otp|reset-password)/i.test(requestUrl)

      const isCandidatePath = window.location.pathname.startsWith('/voice-interview') ||
                              window.location.pathname.startsWith('/interview') ||
                              window.location.pathname.startsWith('/case-study') ||
                              window.location.pathname.startsWith('/apply')

      if (!isLoginRoute && !isCandidatePath) {
        window.__hireIqAuthRedirecting = true
        store.dispatch(logout())
        localStorage.removeItem('auth')
        localStorage.removeItem('masterToken')
        localStorage.removeItem('adminToken')
        localStorage.removeItem('token')
        window.location.assign('/login')
      }
      return Promise.reject(error)
    }
    if (error.response && error.response.status === 403) {
      const detail = error.response.data?.detail;
      if (detail && detail.toLowerCase().includes('deactivated')) {
        Swal.fire({
          title: 'Access Revoked',
          text: 'Your account has been deactivated. Please contact support.',
          icon: 'error',
          confirmButtonText: 'OK'
        }).then(() => {
          store.dispatch(logout());
          window.location.href = '/login';
        });
      }
    }
    return Promise.reject(error);
  }
);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      } persistor={persistor}>
        <App />
      </PersistGate>
    </Provider>
  </StrictMode>,
)
