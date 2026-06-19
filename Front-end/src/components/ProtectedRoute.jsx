import React from 'react'
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ children, allowedRoles }) {
  const token = sessionStorage.getItem('adminToken')
  const role = sessionStorage.getItem('adminRole')

  if (!token) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    // Redirect based on role
    if (role === 'super_admin' || role === 'master') {
      return <Navigate to="/super-admin" replace />
    } else if (role === 'admin' || role === 'tenant') {
      return <Navigate to="/admin" replace />
    } else {
      return <Navigate to="/login" replace />
    }
  }

  return children
}
