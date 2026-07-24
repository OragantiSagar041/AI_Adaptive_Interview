import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Calendar, Globe, Plug, Loader2, Search, MessageSquare, Database, Phone, ChevronLeft, ExternalLink, TrendingUp } from 'lucide-react'
import { API_BASE_URL } from '../../apiConfig'

// Mock Data for the Integrations Grid
const INTEGRATIONS = [
  { id: 'cal_com', name: 'Cal.com', category: 'Calendar & CRM', tag: 'During Call', desc: 'Sync your Cal.com calendar to allow voice assistants to schedule meetings on your behalf.', icon: Calendar, color: 'text-slate-200', bg: 'bg-slate-200/10' },
  { id: 'calendly', name: 'Calendly', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Calendly account to check availability and schedule appointments through your voice assistants.', icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'custom_api', name: 'Custom API', category: 'Custom & Tools', tag: 'During Call', desc: 'Connect to any custom API endpoint to extend your assistant\'s capabilities with external data and services.', icon: Globe, color: 'text-orange-500', bg: 'bg-orange-500/10' },
  { id: 'salesforce', name: 'Salesforce', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your Salesforce CRM to access customer data, manage leads, and update records through your voice assistants.', icon: Database, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  { id: 'google_calendar', name: 'Google Calendar', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Google Calendar to check availability and schedule appointments through your voice assistants.', icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { id: 'google_sheets_during', name: 'Google Sheets', category: 'Data & Sheets', tag: 'During Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data during calls.', icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'google_sheets_post', name: 'Google Sheets', category: 'Data & Sheets', tag: 'Post Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data through your voice assistants.', icon: Database, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { id: 'slack', name: 'Slack', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Slack workspace to receive notifications and updates about your voice assistants.', icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { id: 'hubspot', name: 'HubSpot', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your HubSpot platform to enable voice assistants to manage contacts, automate marketing campaigns, and handle customer service tasks.', icon: Database, color: 'text-orange-600', bg: 'bg-orange-600/10' },
  { id: 'genesys', name: 'Genesys', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Genesys Cloud contact center to enhance customer experience with AI-powered routing, real-time analytics, and seamless voice AI assistant integration.', icon: Phone, color: 'text-red-500', bg: 'bg-red-500/10' },
  { id: 'whatsapp', name: 'WhatsApp Cloud', category: 'Messaging', tag: 'During Call', desc: 'Send WhatsApp messages during calls using Meta Cloud API templates via your connected Cloud WhatsApp number.', icon: MessageSquare, color: 'text-green-500', bg: 'bg-green-500/10' },
]

const CATEGORIES = [
  { id: 'All', count: 11 },
  { id: 'Calendar & CRM', count: 6 },
  { id: 'Messaging', count: 2 },
  { id: 'Data & Sheets', count: 2 },
  { id: 'Custom & Tools', count: 1 }
]

export default function IntegrationModal({ isOpen, onClose, onRefresh }) {
  const [selectedConfig, setSelectedConfig] = useState(null) // null means grid view, 'calendly' or 'custom_api'
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Calendly State
  const [calendlyForm, setCalendlyForm] = useState({ token: '' })
  
  // Custom API (Webhook) State
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    method: 'POST',
    headers: '',
    body: ''
  })

  if (!isOpen) return null

  const handleCalendlySubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('token')
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/calendly`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ token: calendlyForm.token })
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
        try {
          parsedHeaders = JSON.parse(webhookForm.headers)
        } catch(e) {
          throw new Error('Headers must be valid JSON', { cause: e })
        }
      }
      let parsedBody = {}
      if (webhookForm.body) {
        try {
          parsedBody = JSON.parse(webhookForm.body)
        } catch(e) {
          throw new Error('Body must be valid JSON', { cause: e })
        }
      }

      const token = localStorage.getItem('token')
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/custom-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: webhookForm.name,
          method: webhookForm.method,
          url: webhookForm.url,
          headers: parsedHeaders,
          body: parsedBody
        })
      })
      const data = await r.json()
      if (r.ok) {
        setSuccess('Webhook integration added successfully!')
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

  const handleClose = () => {
    setSelectedConfig(null)
    setActiveCategory('All')
    setSearchQuery('')
    onClose()
  }

  const filteredIntegrations = INTEGRATIONS.filter(int => {
    const matchesCategory = activeCategory === 'All' || int.category === activeCategory
    const matchesSearch = int.name.toLowerCase().includes(searchQuery.toLowerCase()) || int.desc.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-900/60 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div 
        className={`bg-white border border-slate-200 rounded-3xl w-full ${
          selectedConfig ? 'max-w-xl' : 'max-w-5xl'
        } my-auto shadow-2xl flex flex-col overflow-hidden relative transition-all duration-300`}
      >
        {/* Dynamic Header with Prominent Top-Right Close Button */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            {selectedConfig ? (
              <button 
                type="button"
                onClick={() => {setSelectedConfig(null); setError(''); setSuccess('')}} 
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-indigo-600 rounded-xl hover:bg-slate-100 transition-colors border border-slate-200 bg-white shadow-sm cursor-pointer"
              >
                <ChevronLeft size={16} /> Back
              </button>
            ) : (
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
            )}
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
          {!selectedConfig ? (
            // GRID VIEW
            <div>
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
                          if (int.id === 'calendly' || int.id === 'custom_api') {
                            setSelectedConfig(int.id)
                          } else {
                            alert('This integration is currently a mockup and not fully implemented yet.')
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
          ) : (
            // CONFIG FORMS
            <div className="p-4">
              {error && <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">{error}</div>}
              {success && <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold">{success}</div>}

              {selectedConfig === 'calendly' && (
                <form onSubmit={handleCalendlySubmit} className="space-y-5">
                  <div className="mb-6">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Connect your Calendly account to allow your voice assistant to check your availability and schedule appointments seamlessly during a call.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Personal Access Token *</label>
                    <input
                      type="text"
                      required
                      value={calendlyForm.token}
                      onChange={e => setCalendlyForm({ ...calendlyForm, token: e.target.value })}
                      placeholder="Enter your Calendly PAT..."
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <p className="text-[0.68rem] text-slate-500 mt-2 font-medium">
                      Get this from Calendly Settings &gt; Integrations &gt; API & Webhooks.
                    </p>
                  </div>
                  <div className="pt-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading || !calendlyForm.token}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                      Connect Calendly
                    </button>
                  </div>
                </form>
              )}

              {selectedConfig === 'custom_api' && (
                <form onSubmit={handleWebhookSubmit} className="space-y-5">
                  <div className="mb-6">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Connect to a custom API or webhook endpoint. Your voice assistant can trigger this endpoint to pass extracted data and trigger workflows.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Integration Name *</label>
                    <input
                      type="text" required
                      value={webhookForm.name}
                      onChange={e => setWebhookForm({ ...webhookForm, name: e.target.value })}
                      placeholder="e.g. My Custom CRM Data Webhook"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Method</label>
                      <select
                        value={webhookForm.method}
                        onChange={e => setWebhookForm({ ...webhookForm, method: e.target.value })}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                      >
                        <option>POST</option>
                        <option>GET</option>
                        <option>PUT</option>
                        <option>PATCH</option>
                        <option>DELETE</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">URL *</label>
                      <input
                        type="url" required
                        value={webhookForm.url}
                        onChange={e => setWebhookForm({ ...webhookForm, url: e.target.value })}
                        placeholder="https://api.example.com/webhook"
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Headers (JSON)</label>
                    <textarea
                      value={webhookForm.headers}
                      onChange={e => setWebhookForm({ ...webhookForm, headers: e.target.value })}
                      placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono h-24 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wide">Body Template (JSON)</label>
                    <textarea
                      value={webhookForm.body}
                      onChange={e => setWebhookForm({ ...webhookForm, body: e.target.value })}
                      placeholder='{"event": "call_ended", "data": {}}'
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono h-24 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                    />
                  </div>
                  <div className="pt-6 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading || !webhookForm.name || !webhookForm.url}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-indigo-600/20 cursor-pointer"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                      Connect Custom API
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}
