import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Radio, PhoneCall, Settings2, Activity, Play, CheckCircle2, XCircle, Phone } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import CallDetailsModal from './CallDetailsModal'

export default function AICallingAgentPage() {
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const token = useSelector(state => state.auth.token)
  const [activeTab, setActiveTab] = useState('configuration')
  const [voiceId, setVoiceId] = useState('default_agent')
  const [systemPrompt, setSystemPrompt] = useState('You are an AI interviewer calling to conduct a phone screening. Be concise and professional.')
  const [isSaving, setIsSaving] = useState(false)
  const [callLogs, setCallLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [selectedCallId, setSelectedCallId] = useState(null)

  const fetchLogs = async () => {
    setLoadingLogs(true)
    try {
      const response = await fetch(`${API_BASE_URL}/api/calls/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      if (response.ok) {
        setCallLogs(data.logs || [])
      }
    } catch (e) {
      console.error("Failed to fetch logs", e)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'logs') {
      fetchLogs()
    }
  }, [activeTab, API_BASE_URL, token])

  const handleSaveConfig = () => {
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      alert("Configuration saved successfully! (Mocked)")
    }, 800)
  }

  const [manualCall, setManualCall] = useState({
    phone: '',
    name: '',
    jobDesc: '',
    resume: null
  })
  const [isCalling, setIsCalling] = useState(false)

  const handleManualCall = async () => {
    if (!manualCall.phone) {
      alert("Please enter a phone number")
      return
    }
    
    setIsCalling(true)
    try {
      const formData = new FormData();
      formData.append('phone_number', manualCall.phone);
      formData.append('candidate_name', manualCall.name || "Candidate");
      formData.append('job_description', manualCall.jobDesc);
      if (manualCall.resume) {
        formData.append('resume', manualCall.resume);
      }

      const response = await fetch(`${API_BASE_URL}/api/calls/initiate-manual`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      const data = await response.json();
      if (response.ok) {
        alert(data.message || "Call initiated successfully!");
        setManualCall({ phone: '', name: '', jobDesc: '', resume: null });
      } else {
        alert("Failed to initiate call: " + (data.detail || "Unknown error"));
      }
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setIsCalling(false);
    }
  }

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wide uppercase mb-3">
            <Radio size={14} className="animate-pulse" />
            Omni Dimension Integration
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            AI Calling Agent
          </h1>
          <p className="text-slate-500 mt-2 max-w-2xl text-sm">
            Configure your AI Voice Agent and view outbound call logs. The AI agent will automatically call candidates to conduct initial phone screens using the Omni Dimension platform.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-200 mb-6 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => setActiveTab('configuration')}
          className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'configuration' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Settings2 size={16} /> Configuration</div>
        </button>
        <button
          onClick={() => setActiveTab('dialer')}
          className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'dialer' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Phone size={16} /> Manual Dialer</div>
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-2 text-sm font-bold transition-colors border-b-2 whitespace-nowrap ${activeTab === 'logs' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          <div className="flex items-center gap-2"><Activity size={16} /> Call Logs</div>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'configuration' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Settings2 size={18} className="text-primary" />
              Agent Configuration
            </h3>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Voice ID / Agent ID</label>
                <input 
                  type="text" 
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="e.g. omni_voice_123"
                />
                <p className="text-xs text-slate-400 mt-1.5">The ID of the Omni Dimension voice to use for outbound calls.</p>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">System Prompt</label>
                <textarea 
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all h-32 resize-none"
                  placeholder="Define the behavior of the AI agent..."
                />
                <p className="text-xs text-slate-400 mt-1.5">This prompt is injected before the candidate's resume context.</p>
              </div>

              <div className="pt-2">
                <Button onClick={handleSaveConfig} disabled={isSaving} className="w-full justify-center py-2.5">
                  {isSaving ? "Saving..." : "Save Configuration"}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-indigo-900 to-slate-900 text-white border-none shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
              <PhoneCall size={120} />
            </div>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 relative z-10">
              <Radio size={18} className="text-indigo-400" />
              Connection Status
            </h3>
            
            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-sm">Omni API</span>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded">CONNECTED</span>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold text-sm">Voice Service</span>
                </div>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded">ACTIVE</span>
              </div>

              <div className="mt-8 pt-6 border-t border-white/10">
                <p className="text-sm text-indigo-200 leading-relaxed">
                  The AI Calling Agent is currently active and ready to dispatch outbound calls. 
                  You can initiate phone screens directly from the Candidates table.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'dialer' && (
        <Card className="max-w-3xl mx-auto p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Phone size={22} className="text-indigo-600" />
              Manual Dialer
            </h3>
            <p className="text-slate-500 text-sm mt-1">
              Initiate an outbound AI call manually by providing a phone number and context (Job Description & Resume).
            </p>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Phone Number *</label>
                <input 
                  type="text" 
                  value={manualCall.phone}
                  onChange={(e) => setManualCall({...manualCall, phone: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">Candidate Name</label>
                <input 
                  type="text" 
                  value={manualCall.name}
                  onChange={(e) => setManualCall({...manualCall, name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="e.g. John Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Job Description</label>
              <textarea 
                value={manualCall.jobDesc}
                onChange={(e) => setManualCall({...manualCall, jobDesc: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all h-24 resize-none"
                placeholder="Paste the job description or role requirements to give the AI context..."
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">Candidate Resume</label>
              <input 
                type="file" 
                accept=".pdf,.doc,.docx"
                onChange={(e) => setManualCall({...manualCall, resume: e.target.files[0]})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
              <p className="text-xs text-slate-400 mt-1.5">Upload a PDF or DOCX file. Text will be extracted for the AI.</p>
            </div>

            <div className="pt-4 flex justify-end">
              <Button onClick={handleManualCall} disabled={isCalling || !manualCall.phone} className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow shadow-indigo-600/30">
                {isCalling ? (
                  <span className="flex items-center gap-2">
                    <Activity size={16} className="animate-spin" /> Calling...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Phone size={16} /> Start AI Call
                  </span>
                )}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {activeTab === 'logs' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="py-3.5 px-6 text-slate-500 font-semibold uppercase text-xs tracking-wider">Candidate</th>
                  <th className="py-3.5 px-4 text-slate-500 font-semibold uppercase text-xs tracking-wider">Phone</th>
                  <th className="py-3.5 px-4 text-slate-500 font-semibold uppercase text-xs tracking-wider">Date</th>
                  <th className="py-3.5 px-4 text-slate-500 font-semibold uppercase text-xs tracking-wider">Duration</th>
                  <th className="py-3.5 px-4 text-slate-500 font-semibold uppercase text-xs tracking-wider">Status</th>
                  <th className="py-3.5 px-6 text-slate-500 font-semibold uppercase text-xs tracking-wider text-right">Recording</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loadingLogs ? (
                  <tr><td colSpan="6" className="text-center py-8 text-slate-500">Loading call logs...</td></tr>
                ) : callLogs.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-8 text-slate-500">No call logs found.</td></tr>
                ) : (
                  callLogs.map(log => (
                    <tr 
                      key={log._id} 
                      className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                      onClick={() => setSelectedCallId(log.call_id || log.id)}
                    >
                      <td className="px-6 py-4 font-semibold text-sm text-slate-700">{log.candidate_name || 'Candidate'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{log.phone_number}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{new Date(log.created_at).toLocaleString()}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{log.duration || '0m 0s'}</td>
                      <td className="px-4 py-4">
                        {log.status?.toLowerCase() === 'completed' ? (
                          <span className="inline-flex items-center gap-1 text-[0.7rem] bg-emerald-50 text-emerald-600 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                            <CheckCircle2 size={12} /> COMPLETED
                          </span>
                        ) : log.status?.toLowerCase() === 'failed' || log.status?.toLowerCase() === 'no answer' ? (
                          <span className="inline-flex items-center gap-1 text-[0.7rem] bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded-full font-bold">
                            <XCircle size={12} /> {log.status.toUpperCase()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[0.7rem] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-bold">
                            <Activity size={12} /> {log.status?.toUpperCase() || 'INITIATED'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {log.recording_url ? (
                          <audio controls src={log.recording_url} className="h-8 w-32 inline-block ml-auto" />
                        ) : (
                          <span className="text-slate-400 text-xs">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selectedCallId && (
        <CallDetailsModal 
          isOpen={!!selectedCallId} 
          onClose={() => setSelectedCallId(null)} 
          callId={selectedCallId} 
          API_BASE_URL={API_BASE_URL} 
          token={token} 
        />
      )}
    </div>
  )
}
