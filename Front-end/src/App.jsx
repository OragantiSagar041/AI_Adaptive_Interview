import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import LandingPage from './pages/LandingPage'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import CaseStudyPage from './pages/CaseStudyPage'
import MasterPage from './pages/MasterPage'

// Protected Route Guard
import ProtectedRoute from './components/ProtectedRoute'

// Admin & SuperAdmin pages (single-page, tab-based routing via ?tab= query param)
import AdminPage from './pages/AdminPage'
import SuperAdminPage from './pages/SuperAdminPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/interview" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/case-study" element={<CaseStudyPage />} />
        <Route path="/master" element={<MasterPage />} />

        {/* SuperAdmin route — single page, tabs handled via ?tab= query param */}
        <Route
          path="/super-admin"
          element={
            <ProtectedRoute allowedRoles={['super_admin', 'master']}>
              <SuperAdminPage />
            </ProtectedRoute>
          }
        />

        {/* Legacy URL alias */}
        <Route path="/super_admin" element={<Navigate to="/super-admin" replace />} />

        {/* Admin route — single page, tabs handled via ?tab= query param */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin', 'tenant']}>
              <AdminPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
