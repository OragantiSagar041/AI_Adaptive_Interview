import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { persistor, store } from './store/store'
import './index.css'
import App from './App.jsx'
import axios from 'axios'
import { logout } from './store/slices/authSlice'
import Swal from 'sweetalert2'

// Global Axios Interceptor for handling deactivated accounts
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !window.__hireIqAuthRedirecting) {
      const isCandidatePath = window.location.pathname.startsWith('/voice-interview') || 
                              window.location.pathname.startsWith('/interview') ||
                              window.location.pathname.startsWith('/case-study') ||
                              window.location.pathname.startsWith('/apply');
      if (!isCandidatePath) {
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
