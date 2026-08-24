import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import api from '../utils/api'
import AccessDeniedScreen from '../components/interview/AccessDeniedScreen'

export default function Interview() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id') || searchParams.get('session')
  const [error, setError] = useState(null)
  const [scheduledStart, setScheduledStart] = useState(null)
  const [loading, setLoading] = useState(true)



  useEffect(() => {
    if (!sessionId) {
      setError("Missing Session ID in URL parameters. Please check your secure interview invitation link.")
      setLoading(false)
      return
    }

    const resolveSession = async () => {
      try {
        const payload = await api.get(`/session/${sessionId}`).then(r => r.data)

        if (payload.status !== 'success') {
          throw new Error(payload.detail || payload.message || "Failed to load session details.")
        }
        if (payload.scheduled_start) {
          setScheduledStart(payload.scheduled_start)
        }
        if (payload.is_deactivated) {
          throw new Error("This interview link has been temporarily deactivated by the recruiter.")
        }
        if (payload.is_expired) {
          throw new Error("This interview link has expired. Please contact the recruiter for a new link.")
        }
        if (payload.is_before_schedule && payload.scheduled_start) {
          setScheduledStart(payload.scheduled_start)
          const startTime = new Date(payload.scheduled_start.endsWith('Z') || payload.scheduled_start.includes('+') ? payload.scheduled_start : payload.scheduled_start + 'Z')
          throw new Error(`This interview is scheduled to start on ${startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}. Please try again at the scheduled time.`)
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
        setError(err.message || "Unable to access this interview session.")
        setLoading(false)
      }
    }
    
    resolveSession()
  }, [sessionId, navigate])

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen flex-col gap-4 text-slate-600">
        <RefreshCw className="animate-spin text-primary" size={32} />
        <span>Loading secure candidate interview environment...</span>
      </div>
    )
  }

  if (error) {
    return <AccessDeniedScreen error={error} scheduledStart={scheduledStart} />
  }

  return null
}
