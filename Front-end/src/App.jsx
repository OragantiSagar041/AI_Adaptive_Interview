import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
// Protected Route Guard
import ProtectedRoute from './components/ProtectedRoute'

// ─── Lazy-loaded routes ───────────────────────────────────────────────────────
// ALL routes are now code-split so the initial JS bundle only contains the
// router skeleton. Each page's heavy dependencies (MediaPipe, TTS, interview
// logic, admin UI) load on demand when the user navigates to that route.

// Public / candidate routes
const LandingPage = React.lazy(() => import('./pages/LandingPage'))
const AiRecruiterLandingPage = React.lazy(() => import('./pages/AiRecruiterLandingPage'))
const RegisterPage = React.lazy(() => import('./pages/RegisterPage'))
const LoginPage = React.lazy(() => import('./pages/LoginPage'))
const Interview = React.lazy(() => import('./pages/Interview'))
const InterviewNormal = React.lazy(() => import('./pages/interview/InterviewNormal').then(m => ({ default: m.InterviewNormal })))
const InterviewTechnical = React.lazy(() => import('./pages/interview/InterviewTechnical').then(m => ({ default: m.InterviewTechnical })))
const InterviewNonTechnical = React.lazy(() => import('./pages/interview/InterviewNonTechnical').then(m => ({ default: m.InterviewNonTechnical })))
const CaseStudyPage = React.lazy(() => import('./pages/CaseStudyPage'))
const VoiceInterviewPage = React.lazy(() => import('./pages/VoiceInterviewPage'))

// Admin / master routes (were already lazy — keep them)
const MasterLayout = React.lazy(() => import('./components/master/MasterLayout'))
const MasterDashboard = React.lazy(() => import('./pages/master/MasterDashboard'))
const Plans = React.lazy(() => import('./pages/master/Plans'))
const Subscribers = React.lazy(() => import('./pages/master/Subscribers'))
const CreateTenant = React.lazy(() => import('./pages/master/CreateTenant'))
const MasterProfile = React.lazy(() => import('./pages/master/MasterProfile'))
const MasterNotifications = React.lazy(() => import('./pages/master/MasterNotifications'))

const AdminPage = React.lazy(() => import('./pages/AdminPage'))
const OverviewDashboardPage = React.lazy(() => import('./pages/admin/OverviewDashboardPage'))
const QualifiedCandidatesPage = React.lazy(() => import('./pages/admin/QualifiedCandidatesPage'))
const RejectedCandidatesPage = React.lazy(() => import('./pages/admin/RejectedCandidatesPage'))
const CreateInterviewPage = React.lazy(() => import('./pages/admin/CreateInterviewPage'))
const ProfileSettings = React.lazy(() => import('./components/admin/ProfileSettings'))
const AdminNotifications = React.lazy(() => import('./pages/admin/AdminNotifications'))

const SuperAdminLayout = React.lazy(() => import('./components/superadmin/SuperAdminLayout'))
const SuperDashboardPage = React.lazy(() => import('./pages/superadmin/SuperDashboardPage'))
const TeamManagementPage = React.lazy(() => import('./pages/superadmin/TeamManagementPage'))
const SuperAdminOverviewDashboardPage = React.lazy(() => import('./pages/superadmin/OverviewDashboardPage'))
const SuperAdminQualifiedCandidatesPage = React.lazy(() => import('./pages/superadmin/QualifiedCandidatesPage'))
const SuperAdminRejectedCandidatesPage = React.lazy(() => import('./pages/superadmin/RejectedCandidatesPage'))
const SuperAdminCreateInterviewPage = React.lazy(() => import('./pages/superadmin/CreateInterviewPage'))
const SuperAdminProfileSettings = React.lazy(() => import('./components/superadmin/ProfileSettings'))
const SuperAdminNotifications = React.lazy(() => import('./pages/superadmin/SuperAdminNotifications'))
const AICallPage = React.lazy(() => import('./pages/admin/AICallPage'))

function App() {
  return (
    <BrowserRouter>
      <React.Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-900 text-white font-semibold text-lg tracking-wide">Loading Interface...</div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/voice-recruiter" element={<AiRecruiterLandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/interview/technical" element={<InterviewTechnical />} />
          <Route path="/interview/normal" element={<InterviewNormal />} />
          <Route path="/interview/non-technical" element={<InterviewNonTechnical />} />
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
            <Route path="ai-calls" element={<AICallPage />} />
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
            <Route path="ai-calls" element={<AICallPage />} />
            <Route path="profile-settings" element={<ProfileSettings />} />
            <Route path="notifications" element={<AdminNotifications />} />
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
    </BrowserRouter>
  )
}

export default App
