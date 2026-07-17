import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import Swal from 'sweetalert2'
import axios from 'axios'
import { X, Calendar, Info } from 'lucide-react'

export default function ScheduleModal({ isOpen, onClose, candidate }) {
  const [startDateTime, setStartDateTime] = useState('')
  const [endDateTime, setEndDateTime] = useState('')
  const [loading, setLoading] = useState(false)
  
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Reset form when opened
  useEffect(() => {
    if (isOpen && candidate) {
      // If we have existing scheduled dates, we could populate them, but for now we leave empty
      setStartDateTime('')
      setEndDateTime('')
    }
  }, [isOpen, candidate])

  if (!isOpen || !candidate) return null;

  const handleReschedule = async () => {
    const linkId = candidate.link_id || candidate.interview_id || candidate.id || candidate._id
    
    // Validate end is after start if both exist
    if (startDateTime && endDateTime) {
      if (new Date(startDateTime) >= new Date(endDateTime)) {
        Swal.fire('Invalid Dates', 'End date must be after start date.', 'error')
        return
      }
    }

    setLoading(true)
    
    // Format to ISO or what backend expects. The backend expects form data.
    const formData = new FormData();
    
    // If end is missing but start is there, add 24 hours. If both missing, set end to 24h from now.
    let expiryStr = endDateTime
    if (!expiryStr) {
      const now = new Date()
      now.setHours(now.getHours() + 24)
      expiryStr = now.toISOString()
    } else {
      expiryStr = new Date(endDateTime).toISOString()
    }
    
    formData.append('new_expiry', expiryStr)
    if (startDateTime) {
      formData.append('new_start', new Date(startDateTime).toISOString())
    }

    try {
      await axios.post(`${API_BASE_URL}/admin/sessions/${linkId}/reschedule`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`
        }
      })
      Swal.fire('Success', 'Session rescheduled successfully. Candidate has been notified.', 'success')
      onClose()
    } catch (err) {
      console.error("Reschedule Error:", err.response?.data || err)
      const msg = err.response?.data?.detail || err.message || 'Failed to reschedule session'
      Swal.fire('Error', msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const cName = candidate.candidate_name || candidate.name || "Candidate"
  const cId = candidate.candidate_id || candidate._id?.substring(0,6) || "N/A"

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-lg">
            <Calendar className="text-[#00A3FF]" size={20} />
            Reschedule Session
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="space-y-1">
            <p className="text-sm text-slate-500">Candidate:</p>
            <div className="flex items-center gap-3">
              <span className="font-bold text-slate-800 uppercase tracking-wide">{cName}</span>
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-xs rounded border border-slate-200 font-mono">ID: {cId}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Start Date & Time</label>
              <input 
                type="datetime-local" 
                value={startDateTime}
                onChange={e => setStartDateTime(e.target.value)}
                className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#00A3FF]/20 focus:border-[#00A3FF] text-slate-700"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">End Date & Time</label>
              <input 
                type="datetime-local" 
                value={endDateTime}
                onChange={e => setEndDateTime(e.target.value)}
                className="w-full text-sm p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#00A3FF]/20 focus:border-[#00A3FF] text-slate-700"
              />
            </div>
          </div>

          <div className="flex gap-3 items-start p-4 bg-[#00A3FF]/5 border border-[#00A3FF]/20 rounded-xl">
            <div className="mt-0.5"><Info size={16} className="text-[#00A3FF]" /></div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Leave dates empty for immediate access (24h default expiry). If configured, candidates can only access the assessment within the specified window.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>
          <button 
            onClick={handleReschedule}
            disabled={loading}
            className="px-5 py-2.5 text-sm font-bold text-white bg-[#00A3FF] hover:bg-[#0090e6] rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm shadow-[#00A3FF]/30"
          >
            {loading ? 'Rescheduling...' : 'Confirm Reschedule'}
          </button>
        </div>
      </div>
    </div>
  )
}
