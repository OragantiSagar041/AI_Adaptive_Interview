import React from 'react'
import { useSelector } from 'react-redux'
import { Navigate } from 'react-router-dom'

function tokenIsExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !payload.exp || payload.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export default function ProtectedRoute({ children, allowedRoles }) {
  const role = useSelector(state => state.auth.role)
  const token = useSelector(state => state.auth.token)

  if (!token || !role || tokenIsExpired(token)) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />
  }

  return children
}
