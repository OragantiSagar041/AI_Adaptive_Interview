import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar, Globe, Plug, Loader2, Search, MessageSquare, Database, Phone, ExternalLink } from 'lucide-react'
import { API_BASE_URL } from '../../apiConfig'

const INTEGRATIONS = [
  { id: 'cal_com', name: 'Cal.com', category: 'Calendar & CRM', tag: 'During Call', desc: 'Sync your Cal.com calendar to allow voice assistants to schedule meetings on your behalf.', icon: Calendar, color: 'text-slate-700', bg: 'bg-slate-100' },
  { id: 'calendly', name: 'Calendly', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Calendly account to check availability and schedule appointments through your voice assistants.', icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'custom_api', name: 'Custom API', category: 'Custom & Tools', tag: 'During Call', desc: 'Connect to any custom API endpoint to extend your assistant\'s capabilities with external data and services.', icon: Globe, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'salesforce', name: 'Salesforce', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your Salesforce CRM to access customer data, manage leads, and update records through your voice assistants.', icon: Database, color: 'text-sky-500', bg: 'bg-sky-50' },
  { id: 'google_calendar', name: 'Google Calendar', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Google Calendar to check availability and schedule appointments through your voice assistants.', icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50' },
  { id: 'google_sheets_during', name: 'Google Sheets', category: 'Data & Sheets', tag: 'During Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data during calls.', icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'google_sheets_post', name: 'Google Sheets', category: 'Data & Sheets', tag: 'Post Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data through your voice assistants.', icon: Database, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { id: 'slack', name: 'Slack', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Slack workspace to receive notifications and updates about your voice assistants.', icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-50' },
  { id: 'hubspot', name: 'HubSpot', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your HubSpot platform to enable voice assistants to manage contacts, automate marketing campaigns, and handle customer service tasks.', icon: Database, color: 'text-orange-500', bg: 'bg-orange-50' },
  { id: 'genesys', name: 'Genesys', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Genesys Cloud contact center to enhance customer experience with AI-powered routing, real-time analytics, and seamless voice AI assistant integration.', icon: Phone, color: 'text-red-500', bg: 'bg-red-50' },
  { id: 'whatsapp', name: 'WhatsApp Cloud', category: 'Messaging', tag: 'During Call', desc: 'Send WhatsApp messages during calls using Meta Cloud API templates via your connected Cloud WhatsApp number.', icon: MessageSquare, color: 'text-emerald-500', bg: 'bg-emerald-50' },
]

const CATEGORIES = [
  { id: 'All', count: 11 },
  { id: 'Calendar & CRM', count: 6 },
  { id: 'Messaging', count: 2 },
  { id: 'Data & Sheets', count: 2 },
  { id: 'Custom & Tools', count: 1 }
]

export default function IntegrationModal({ isOpen, onClose, onRefresh }) {
  const [selectedConfig, setSelectedConfig] = useState(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Cal.com Form State
  const [calComForm, setCalComForm] = useState({
    name: '',
    cal_api_key: '',
    cal_id: '',
    cal_timezone: 'America/Los_Angeles'
  })

  // Calendly Form State
  const [calendlyForm, setCalendlyForm] = useState({
    name: 'Calendly Integration',
    token: ''
  })
  
  // Custom API Form State
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    method: 'POST',
    headers: '',
    body: ''
  })

  // Generic Form State
  const [genericForm, setGenericForm] = useState({
    name: '',
    apiKey: '',
    workspaceId: ''
  })

  const [mounted, setMounted] = useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!isOpen || !mounted || typeof document === 'undefined') return null

  const getHeaders = () => {
    const token = localStorage.getItem('token')
    const omniApiKey = sessionStorage.getItem('omniDimensionApiKey') || ''
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {})
    }
  }

  const handleCalComSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/cal-com`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(calComForm)
      })
      const data = await r.json()
      if (r.ok) {
        setSuccess('Cal.com integration added successfully!')
        setTimeout(() => { handleClose(); onRefresh() }, 1500)
      } else {
        setError(data.detail || 'Failed to add Cal.com integration')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCalendlySubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/calendly`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: calendlyForm.name,
          cal_api_key: calendlyForm.token,
          cal_id: 'default',
          cal_timezone: 'America/Los_Angeles'
        })
      })
      const data = await r.json()
      if (r.ok) {
        setSuccess('Calendly integration added successfully!')
        setTimeout(() => { handleClose(); onRefresh() }, 1500)
      } else {
        setError(data.detail || 'Failed to add Calendly integration')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleWebhookSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      let parsedHeaders = {}
      if (webhookForm.headers) {
        try { parsedHeaders = JSON.parse(webhookForm.headers) } catch(e) { throw new Error('Headers must be valid JSON') }
      }
      let parsedBody = {}
      if (webhookForm.body) {
        try { parsedBody = JSON.parse(webhookForm.body) } catch(e) { throw new Error('Body must be valid JSON') }
      }

      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/custom-api`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: webhookForm.name,
          method: webhookForm.method,
          url: webhookForm.url,
          headers: parsedHeaders,
          body_content: parsedBody
        })
      })
      const data = await r.json()
      if (r.ok) {
        setSuccess('Custom API integration added successfully!')
        setTimeout(() => { handleClose(); onRefresh() }, 1500)
      } else {
        setError(data.detail || 'Failed to add Webhook integration')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGenericSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const selectedInt = INTEGRATIONS.find(i => i.id === selectedConfig)
      const intName = genericForm.name || selectedInt?.name || 'Integration'
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/custom-api`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: intName,
          method: 'POST',
          url: `https://api.omnidimension.com/v1/integrations/${selectedConfig}`,
          headers: { "Authorization": `Bearer ${genericForm.apiKey}` },
          body_content: { workspace_id: genericForm.workspaceId }
        })
      })
      const data = await r.json()
      if (r.ok) {
        setSuccess(`${intName} connected successfully!`)
        setTimeout(() => { handleClose(); onRefresh() }, 1500)
      } else {
        setError(data.detail || `Failed to connect ${intName}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setSelectedConfig(null)
    setActiveCategory('All')
    setSearchQuery('')
    setError('')
    setSuccess('')
    onClose()
  }

  const filteredIntegrations = INTEGRATIONS.filter(int => {
    const matchesCategory = activeCategory === 'All' || int.category === activeCategory
    const matchesSearch = int.name.toLowerCase().includes(searchQuery.toLowerCase()) || int.desc.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  const selectedInt = INTEGRATIONS.find(i => i.id === selectedConfig)

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/50 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      {selectedConfig ? (
        /* FLOATING CONNECTION DIALOG (WHITE THEME) */
        <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 relative animate-in zoom-in-95 duration-200">
          {/* Top Right Close Icon */}
          <button 
            type="button"
            onClick={() => { setSelectedConfig(null); setError(''); setSuccess('') }}
            className="absolute top-5 right-5 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>

          {/* Alert notifications */}
          {error && <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">{error}</div>}
          {success && <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold">{success}</div>}

          {/* CAL.COM FORM */}
          {selectedConfig === 'cal_com' && (
            <form onSubmit={handleCalComSubmit} className="space-y-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Connect Cal.com Integration</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Enter your Cal.com API credentials to connect your calendar.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Integration name</label>
                <input
                  type="text" required
                  value={calComForm.name}
                  onChange={e => setCalComForm({ ...calComForm, name: e.target.value })}
                  placeholder="Enter integration name"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">API Key (Cal.com)</label>
                <input
                  type="text" required
                  value={calComForm.cal_api_key}
                  onChange={e => setCalComForm({ ...calComForm, cal_api_key: e.target.value })}
                  placeholder="Enter Cal.com API key"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Event Type ID (Cal.com)</label>
                <input
                  type="text" required
                  value={calComForm.cal_id}
                  onChange={e => setCalComForm({ ...calComForm, cal_id: e.target.value })}
                  placeholder="Enter Event Type ID"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Timezone (Optional)</label>
                <select
                  value={calComForm.cal_timezone}
                  onChange={e => setCalComForm({ ...calComForm, cal_timezone: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all cursor-pointer font-medium"
                >
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Asia/Kolkata">Asia/Kolkata</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedConfig(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !calComForm.cal_api_key || !calComForm.cal_id}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          )}

          {/* CALENDLY FORM */}
          {selectedConfig === 'calendly' && (
            <form onSubmit={handleCalendlySubmit} className="space-y-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Connect Calendly Integration</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Enter your Calendly API credentials to connect your calendar.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Integration Name</label>
                <input
                  type="text" required
                  value={calendlyForm.name}
                  onChange={e => setCalendlyForm({ ...calendlyForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Personal Access Token (PAT) *</label>
                <input
                  type="text" required
                  value={calendlyForm.token}
                  onChange={e => setCalendlyForm({ ...calendlyForm, token: e.target.value })}
                  placeholder="Enter Calendly Personal Access Token"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedConfig(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !calendlyForm.token}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          )}

          {/* CUSTOM API WEBHOOK FORM */}
          {selectedConfig === 'custom_api' && (
            <form onSubmit={handleWebhookSubmit} className="space-y-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Connect Custom API Endpoint</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Pass live extracted caller data to any external API endpoint.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Integration Name *</label>
                <input
                  type="text" required
                  value={webhookForm.name}
                  onChange={e => setWebhookForm({ ...webhookForm, name: e.target.value })}
                  placeholder="e.g. CRM Sync Endpoint"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-1">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">Method</label>
                  <select
                    value={webhookForm.method}
                    onChange={e => setWebhookForm({ ...webhookForm, method: e.target.value })}
                    className="w-full px-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
                  >
                    <option>POST</option>
                    <option>GET</option>
                    <option>PUT</option>
                    <option>PATCH</option>
                    <option>DELETE</option>
                  </select>
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">URL *</label>
                  <input
                    type="url" required
                    value={webhookForm.url}
                    onChange={e => setWebhookForm({ ...webhookForm, url: e.target.value })}
                    placeholder="https://api.example.com/webhook"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Headers (JSON)</label>
                <textarea
                  value={webhookForm.headers}
                  onChange={e => setWebhookForm({ ...webhookForm, headers: e.target.value })}
                  placeholder='{"Authorization": "Bearer token"}'
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono h-20 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedConfig(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !webhookForm.name || !webhookForm.url}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          )}

          {/* GENERIC THIRD PARTY FORM */}
          {selectedConfig && selectedConfig !== 'cal_com' && selectedConfig !== 'calendly' && selectedConfig !== 'custom_api' && (
            <form onSubmit={handleGenericSubmit} className="space-y-4">
              <div>
                <h3 className="font-extrabold text-lg text-slate-800 tracking-tight">Connect {selectedInt?.name || 'Integration'}</h3>
                <p className="text-xs text-slate-500 mt-1 font-medium">Enter your credentials to connect {selectedInt?.name} to your Omni Dimension voice agent.</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Integration name</label>
                <input
                  type="text" required
                  value={genericForm.name}
                  onChange={e => setGenericForm({ ...genericForm, name: e.target.value })}
                  placeholder={`Enter integration name`}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">API Key / Token *</label>
                <input
                  type="text" required
                  value={genericForm.apiKey}
                  onChange={e => setGenericForm({ ...genericForm, apiKey: e.target.value })}
                  placeholder={`Enter ${selectedInt?.name} API key`}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Workspace / Account ID (Optional)</label>
                <input
                  type="text"
                  value={genericForm.workspaceId}
                  onChange={e => setGenericForm({ ...genericForm, workspaceId: e.target.value })}
                  placeholder="Optional Account ID"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedConfig(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !genericForm.apiKey}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* MAIN INTEGRATION GRID WINDOW (WHITE THEME) */
        <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-5xl my-auto shadow-2xl flex flex-col overflow-hidden relative transition-all duration-300">
          {/* Dynamic Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
                <Plug size={18} />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-slate-800 tracking-tight">
                  Connect New Integrations
                </h2>
                <p className="text-[0.72rem] text-slate-500 font-medium">Extend your AI assistant with calendar scheduling, CRMs, and custom webhooks.</p>
              </div>
            </div>

            {/* Top Right Close Button */}
            <button 
              type="button"
              onClick={handleClose} 
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all shadow-sm cursor-pointer"
              title="Close Window"
            >
              <span>Close</span>
              <X size={16} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto max-h-[75vh] bg-white p-6">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border transition-colors cursor-pointer ${
                      activeCategory === cat.id 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold' 
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {cat.id} <span className="opacity-60 ml-1.5">{cat.count}</span>
                  </button>
                ))}
              </div>
              <div className="relative w-full md:w-64">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search Integrations"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIntegrations.map((int, idx) => (
                <div key={idx} className="bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col group hover:border-indigo-300 hover:shadow-md transition-all">
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${int.bg} border border-slate-100`}>
                          <int.icon size={20} className={int.color} />
                        </div>
                        <span className="font-bold text-slate-800 text-sm tracking-wide">{int.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-bold tracking-wider uppercase border flex items-center gap-1 shrink-0 ${
                        int.tag === 'During Call' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-indigo-50 border-indigo-200 text-indigo-600'
                      }`}>
                        {int.tag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed line-clamp-3">
                      {int.desc}
                    </p>
                  </div>
                  <div className="border-t border-slate-100 p-3.5 flex justify-start bg-slate-50/50">
                    <button 
                      type="button"
                      onClick={() => {
                        setSelectedConfig(int.id)
                        if (int.id !== 'cal_com' && int.id !== 'calendly' && int.id !== 'custom_api') {
                          setGenericForm({ name: `${int.name} Integration`, apiKey: '', workspaceId: '' })
                        }
                      }}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-600 transition-colors group-hover:border-indigo-300 cursor-pointer"
                    >
                      Connect <ExternalLink size={12} className="text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
