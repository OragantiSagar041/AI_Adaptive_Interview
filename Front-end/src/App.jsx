import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Interview from './pages/Interview'
import LandingPage from './pages/LandingPage'
import RegisterPage from './pages/RegisterPage'
import LoginPage from './pages/LoginPage'
import CaseStudyPage from './pages/CaseStudyPage'
import VoiceInterviewPage from './pages/VoiceInterviewPage'
import MasterLayout from './components/master/MasterLayout'
import MasterDashboard from './pages/master/MasterDashboard'
import Plans from './pages/master/Plans'
import Subscribers from './pages/master/Subscribers'
import CreateTenant from './pages/master/CreateTenant'
import MasterProfile from './pages/master/MasterProfile'
import MasterNotifications from './pages/master/MasterNotifications'

// Protected Route Guard
import ProtectedRoute from './components/ProtectedRoute'

// Admin & SuperAdmin layouts and pages
import AdminPage from './pages/AdminPage'
import OverviewDashboardPage from './pages/admin/OverviewDashboardPage'
import QualifiedCandidatesPage from './pages/admin/QualifiedCandidatesPage'
import RejectedCandidatesPage from './pages/admin/RejectedCandidatesPage'
import CreateInterviewPage from './pages/admin/CreateInterviewPage'
import ProfileSettings from './components/admin/ProfileSettings'
import AdminNotifications from './pages/admin/AdminNotifications'

// SuperAdmin
import SuperAdminLayout from './components/superadmin/SuperAdminLayout'
import SuperDashboardPage from './pages/superadmin/SuperDashboardPage'
import TeamManagementPage from './pages/superadmin/TeamManagementPage'
import SuperAdminOverviewDashboardPage from './pages/superadmin/OverviewDashboardPage'
import SuperAdminQualifiedCandidatesPage from './pages/superadmin/QualifiedCandidatesPage'
import SuperAdminRejectedCandidatesPage from './pages/superadmin/RejectedCandidatesPage'
import SuperAdminCreateInterviewPage from './pages/superadmin/CreateInterviewPage'
import SuperAdminProfileSettings from './components/superadmin/ProfileSettings'
import SuperAdminNotifications from './pages/superadmin/SuperAdminNotifications'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/case-study" element={<CaseStudyPage />} />
        <Route path="/voice-interview/:linkId" element={<VoiceInterviewPage />} />
        {/* Master routes */}
        <Route
          path="/master"
          element={
            <ProtectedRoute allowedRoles={['master']}>
              <MasterLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<MasterDashboard />} />
          <Route path="plans" element={<Plans />} />
          <Route path="subscribers" element={<Subscribers />} />
          <Route path="create-tenant" element={<CreateTenant />} />
          <Route path="profile" element={<MasterProfile />} />
          <Route path="notifications" element={<MasterNotifications />} />
        </Route>

        {/* SuperAdmin routes — must be above admin routes */}
        <Route
          path="/superadmin"
          element={
            <ProtectedRoute allowedRoles={['superadmin']}>
              <SuperAdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="super-dashboard" replace />} />
          <Route path="super-dashboard" element={<SuperDashboardPage />} />
          <Route path="team" element={<TeamManagementPage />} />
          <Route path="dashboard" element={<SuperAdminOverviewDashboardPage />} />
          <Route path="qualified-candidates" element={<SuperAdminQualifiedCandidatesPage />} />
          <Route path="rejected-candidates" element={<SuperAdminRejectedCandidatesPage />} />
          <Route path="create-interview" element={<SuperAdminCreateInterviewPage />} />
          <Route path="profile-settings" element={<SuperAdminProfileSettings />} />
          <Route path="notifications" element={<SuperAdminNotifications />} />
        </Route>

        {/* Legacy URL aliases */}
        <Route path="/super-admin" element={<Navigate to="/superadmin/super-dashboard" replace />} />
        <Route path="/super_admin" element={<Navigate to="/superadmin/super-dashboard" replace />} />

        {/* Admin route — with nested sub-routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <AdminPage />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<OverviewDashboardPage />} />
          <Route path="qualified-candidates" element={<QualifiedCandidatesPage />} />
          <Route path="rejected-candidates" element={<RejectedCandidatesPage />} />
          <Route path="create-interview" element={<CreateInterviewPage />} />
          <Route path="profile-settings" element={<ProfileSettings />} />
          <Route path="notifications" element={<AdminNotifications />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
