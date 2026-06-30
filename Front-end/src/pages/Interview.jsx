import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../utils/api'

export default function Interview() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id') || searchParams.get('session')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!sessionId) {
      setError("Missing Session ID in URL parameters. Please check your secure interview invitation link.")
      return
    }

    const resolveSession = async () => {
      try {
        const payload = await api.get(`/session/${sessionId}`).then(r => r.data)
        
        if (payload.status !== 'success') {
          throw new Error(payload.detail || payload.message || "Failed to load session details.")
        }
        if (payload.is_deactivated) {
          throw new Error("This interview link has been temporarily deactivated by the recruiter.")
        }
        if (payload.is_expired) {
          throw new Error("This interview link has expired. Please contact the recruiter for a new link.")
        }
        if (payload.session_status === 'completed') {
          throw new Error("This interview session has already been completed.")
        }

        if (payload.interview_format === 'Voice') {
          navigate(`/voice-interview/${sessionId}`, { replace: true })
          return
        }

        const type = payload.interview_type || 'Technical'
        if (type === 'Technical') {
          navigate(`/interview/technical?session_id=${sessionId}`, { replace: true })
        } else if (type === 'Non-Technical') {
          navigate(`/interview/non-technical?session_id=${sessionId}`, { replace: true })
        } else {
          navigate(`/interview/normal?session_id=${sessionId}`, { replace: true })
        }
      } catch (err) {
        setError(err.response?.data?.detail || err.response?.data?.message || err.message || "Unable to access this interview session.")
      }
    }

    resolveSession()
  }, [sessionId, navigate])

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen flex-col p-6 text-center">
        <AlertTriangle className="text-danger mb-4" size={48} />
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Access Denied</h2>
        <p className="text-slate-600 mt-2 max-w-md text-sm">{error}</p>
        <a href="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all shadow-[0_4px_14px_rgba(99,102,241,0.15)] mt-6 no-underline">Go to Platform Page</a>
      </div>
    )
  }

  return (
    <div className="flex justify-center items-center h-screen flex-col gap-4 text-slate-600">
      <RefreshCw className="animate-spin text-primary" size={32} />
      <span>Redirecting to secure interview environment...</span>
    </div>
  )
}
