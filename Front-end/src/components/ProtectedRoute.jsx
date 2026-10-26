import React from 'react'
import { useSelector } from 'react-redux'
import { Navigate, useLocation } from 'react-router-dom'

function tokenIsExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !payload.exp || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export const normalizeRole = (r) => {
  if (!r) return ''
  const lower = String(r).trim().toLowerCase()
  // SuperAdmin roles: superadmin, super_admin, tenant
  if (lower === 'super_admin' || lower === 'superadmin' || lower === 'tenant') return 'superadmin'
  // Admin / recruiter roles: admin, recruiter, subadmin
  if (lower === 'admin' || lower === 'recruiter' || lower === 'subadmin') return 'admin'
  // Master role
  if (lower === 'master') return 'master'
  return lower
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const reduxRole = useSelector(state => state.auth.role)
  const token = useSelector(state => state.auth.token) ||
    localStorage.getItem('adminToken') ||
    localStorage.getItem('masterToken') ||
    localStorage.getItem('superadminToken') ||
    localStorage.getItem('token')
  const storedRole = localStorage.getItem('adminRole')
  const location = useLocation()

  const rawRole = reduxRole || storedRole
  const currentRole = normalizeRole(rawRole)

  if (!token || !currentRole || tokenIsExpired(token)) {
    return <Navigate to="/login" replace />
  }

  // Master role has administrative access across all protected areas
  if (currentRole === 'master') {
    return children
  }

  const normalizedAllowed = allowedRoles ? allowedRoles.map(normalizeRole) : []

  // SuperAdmins have access to both superadmin and admin routes
  if (currentRole === 'superadmin') {
    if (!allowedRoles || normalizedAllowed.includes('superadmin') || normalizedAllowed.includes('admin')) {
      return children
    }
  }

  // Admins / Recruiters have access to admin routes
  if (currentRole === 'admin') {
    if (!allowedRoles || normalizedAllowed.includes('admin')) {
      return children
    }

    // Smart redirect: If a recruiter/admin hits a /superadmin route, seamlessly redirect to equivalent /admin route
    if (location.pathname.startsWith('/superadmin')) {
      const subPath = location.pathname.replace(/^\/superadmin\/?/, '')
      const equivalentAdminPath = (subPath === 'new-dashboard' || subPath === 'dashboard')
        ? '/admin/dashboard'
        : `/admin/${subPath}`
      return <Navigate to={equivalentAdminPath} replace state={location.state} />
    }
  }

  return <Navigate to="/unauthorized" replace />
}
