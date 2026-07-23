import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Plug, Loader2, Search, ChevronLeft, ExternalLink } from 'lucide-react'
import { API_BASE_URL } from '../../apiConfig'

// Authentic Brand SVG Logos
const CalComLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="#111827" />
    <path d="M6 8h12M6 12h12M6 16h8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

const CalendlyLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" fill="#006BFF" />
    <path d="M12 6a6 6 0 100 12 6 6 0 000-12zm0 9.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" fill="#FFFFFF" />
    <path d="M12 8.5A3.5 3.5 0 008.5 12h-2.5A6 6 0 0112 6v2.5z" fill="#FFFFFF" />
  </svg>
)

const CustomApiLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="6" fill="#27272A" />
    <path d="M7 9l-3 3 3 3M17 9l3 3-3 3M14 7l-4 10" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const SalesforceLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M19.3 10.4a4.4 4.4 0 00-3.8-2.1c-.5 0-1 .1-1.5.3A5.4 5.4 0 008.8 6a5.5 5.5 0 00-5.3 4.2A4.4 4.4 0 001 14.2a4.4 4.4 0 004.4 4.4h13.8a3.8 3.8 0 003.8-3.8 3.8 3.8 0 00-3.7-4.4z" fill="#00A1E0" />
  </svg>
)

const GoogleCalendarLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="5" fill="#FFFFFF" />
    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2z" fill="#4285F4" />
    <path d="M5 9h14v11H5V9z" fill="#FFFFFF" />
    <text x="12" y="17.5" textAnchor="middle" fontSize="9" fontWeight="900" fill="#4285F4" fontFamily="sans-serif">31</text>
  </svg>
)

const GoogleSheetsLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <rect width="24" height="24" rx="5" fill="#0F9D58" />
    <rect x="6" y="6" width="12" height="12" rx="1" fill="#FFFFFF" />
    <path d="M6 10h12M6 14h12M10 6v12M14 6v12" stroke="#0F9D58" strokeWidth="1.5" />
  </svg>
)

const SlackLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M6 15a2 2 0 100 4 2 2 0 000-4zm0 0h2v-2H6v2zm0-6a2 2 0 10-4 0 2 2 0 004 0zm0 0v2H6V9z" fill="#E01E5A" />
    <path d="M9 6a2 2 0 104 0 2 2 0 00-4 0zm0 0v2h2V6H9zm6 0a2 2 0 100-4 2 2 0 000 4zm0 0h-2v2h2V6z" fill="#36C5F0" />
    <path d="M18 9a2 2 0 100-4 2 2 0 000 4zm0 0h-2v2h2V9zm0 6a2 2 0 104 0 2 2 0 00-4 0zm0 0v-2h2v2h-2z" fill="#2EB67D" />
    <path d="M15 18a2 2 0 10-4 0 2 2 0 004 0zm0 0v-2h-2v2h2zm-6 0a2 2 0 100 4 2 2 0 000-4zm0 0h2v-2H9v2z" fill="#ECB22E" />
  </svg>
)

const HubSpotLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M17.5 10.5a2.5 2.5 0 00-1.87.84l-4.13-2.61V6.5a2.5 2.5 0 10-2 0v2.23l-3.37 2.13a2.5 2.5 0 101.07 1.69l3.3-2.09v3.04a2.5 2.5 0 102 0v-3.04l4.06 2.57a2.5 2.5 0 10.94-2.52z" fill="#FF7A59" />
  </svg>
)

const GenesysLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="7" cy="12" r="3.5" fill="#FF4F00" />
    <circle cx="17" cy="7" r="3" fill="#FF4F00" />
    <circle cx="17" cy="17" r="3" fill="#FF4F00" />
  </svg>
)

const WhatsAppLogo = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className}>
    <circle cx="12" cy="12" r="10" fill="#25D366" />
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347" fill="#FFFFFF" />
  </svg>
)

// Integrations Data Grid with Official Logos
const INTEGRATIONS = [
  { id: 'cal_com', name: 'Cal.com', category: 'Calendar & CRM', tag: 'During Call', desc: 'Sync your Cal.com calendar to allow voice assistants to schedule meetings on your behalf.', icon: CalComLogo, bg: 'bg-slate-800/40' },
  { id: 'calendly', name: 'Calendly', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Calendly account to check availability and schedule appointments through your voice assistants.', icon: CalendlyLogo, bg: 'bg-blue-500/10' },
  { id: 'custom_api', name: 'Custom API', category: 'Custom & Tools', tag: 'During Call', desc: 'Connect to any custom API endpoint to extend your assistant\'s capabilities with external data and services.', icon: CustomApiLogo, bg: 'bg-orange-500/10' },
  { id: 'salesforce', name: 'Salesforce', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your Salesforce CRM to access customer data, manage leads, and update records through your voice assistants.', icon: SalesforceLogo, bg: 'bg-blue-400/10' },
  { id: 'google_calendar', name: 'Google Calendar', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Google Calendar to check availability and schedule appointments through your voice assistants.', icon: GoogleCalendarLogo, bg: 'bg-blue-500/10' },
  { id: 'google_sheets_during', name: 'Google Sheets', category: 'Data & Sheets', tag: 'During Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data during calls.', icon: GoogleSheetsLogo, bg: 'bg-emerald-500/10' },
  { id: 'google_sheets_post', name: 'Google Sheets', category: 'Data & Sheets', tag: 'Post Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data through your voice assistants.', icon: GoogleSheetsLogo, bg: 'bg-emerald-500/10' },
  { id: 'slack', name: 'Slack', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Slack workspace to receive notifications and updates about your voice assistants.', icon: SlackLogo, bg: 'bg-rose-500/10' },
  { id: 'hubspot', name: 'HubSpot', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your HubSpot platform to enable voice assistants to manage contacts, automate marketing campaigns, and handle customer service tasks.', icon: HubSpotLogo, bg: 'bg-orange-600/10' },
  { id: 'genesys', name: 'Genesys', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Genesys Cloud contact center to enhance customer experience with AI-powered routing, real-time analytics, and seamless voice AI assistant integration.', icon: GenesysLogo, bg: 'bg-red-500/10' },
  { id: 'whatsapp', name: 'WhatsApp Cloud', category: 'Messaging', tag: 'During Call', desc: 'Send WhatsApp messages during calls using Meta Cloud API templates via your connected Cloud WhatsApp number.', icon: WhatsAppLogo, bg: 'bg-green-500/10' },
]

const CATEGORIES = [
  { id: 'All', count: 11 },
  { id: 'Calendar & CRM', count: 6 },
  { id: 'Messaging', count: 2 },
  { id: 'Data & Sheets', count: 2 },
  { id: 'Custom & Tools', count: 1 }
]

export default function IntegrationModal({ isOpen, onClose, onRefresh, omniApiKey = '' }) {
  const [selectedConfig, setSelectedConfig] = useState(null)
  const [activeCategory, setActiveCategory] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [calendlyForm, setCalendlyForm] = useState({ name: '', token: '', eventTypeId: '', timezone: 'UTC' })
  const [calComForm, setCalComForm] = useState({ name: '', apiKey: '', eventTypeId: '', timezone: 'UTC' })
  const [genericForm, setGenericForm] = useState('')
  
  // Custom API (Webhook) State
  const [webhookForm, setWebhookForm] = useState({
    name: '',
    url: '',
    method: 'POST',
    headers: '',
    body: ''
  })

  useEffect(() => {
    if (!isOpen) return undefined
    const handleEscape = event => { if (event.key === 'Escape' && !loading) handleClose() }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, loading])

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
          Authorization: `Bearer ${token}`,
          ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {}),
        },
        body: JSON.stringify({ name: calendlyForm.name || 'Calendly', cal_api_key: calendlyForm.token, cal_id: calendlyForm.eventTypeId, cal_timezone: calendlyForm.timezone })
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
          Authorization: `Bearer ${token}`,
          ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {}),
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

  const handleCalComSubmit = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/calls/integrations/calendly`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {}) },
        body: JSON.stringify({ name: calComForm.name, cal_api_key: calComForm.apiKey, cal_id: calComForm.eventTypeId, cal_timezone: calComForm.timezone }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to add Cal.com integration')
      setSuccess('Cal.com integration added successfully!')
      setTimeout(() => { handleClose(); onRefresh() }, 900)
    } catch (error) { setError(error.message) } finally { setLoading(false) }
  }

  const handleGenericSubmit = async event => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const integration = JSON.parse(genericForm)
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/calls/integrations/from-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {}) },
        body: JSON.stringify({ integration }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || 'Failed to add integration')
      setSuccess('Integration added successfully!')
      setTimeout(() => { handleClose(); onRefresh() }, 900)
    } catch (error) { setError(error.message.includes('JSON') ? 'Enter a valid JSON integration payload.' : error.message) } finally { setLoading(false) }
  }

  function handleClose() {
    setSelectedConfig(null)
    setActiveCategory('All')
    setSearchQuery('')
    setError('')
    setSuccess('')
    setCalComForm({ name: '', apiKey: '', eventTypeId: '', timezone: 'UTC' })
    setGenericForm('')
    onClose()
  }

  const filteredIntegrations = INTEGRATIONS.filter(int => {
    const matchesCategory = activeCategory === 'All' || int.category === activeCategory
    const matchesSearch = int.name.toLowerCase().includes(searchQuery.toLowerCase()) || int.desc.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
      onMouseDown={event => { if (event.target === event.currentTarget && !loading) handleClose() }}
    >
      <div 
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="integration-modal-title" 
        onMouseDown={event => event.stopPropagation()} 
        className={`bg-[#0d0d12] border border-white/15 rounded-2xl w-full ${selectedConfig ? 'max-w-xl' : 'max-w-6xl'} overflow-hidden shadow-2xl flex flex-col max-h-[88vh] my-auto transition-all duration-300 relative`}
      >
        
        {/* Dynamic Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-white/10 bg-[#14141c] shrink-0 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            {selectedConfig ? (
              <button 
                onClick={() => {setSelectedConfig(null); setError(''); setSuccess('')}} 
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10"
                title="Back to all integrations"
              >
                <ChevronLeft size={18} />
              </button>
            ) : (
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Plug size={20} />
              </div>
            )}
            <div>
              <h2 id="integration-modal-title" className="text-lg font-bold text-white tracking-wide leading-tight">
                {selectedConfig === 'calendly' ? 'Connect Calendly' : selectedConfig === 'cal_com' ? 'Connect Cal.com' : selectedConfig === 'custom_api' ? 'Connect Custom API' : selectedConfig ? `Connect ${INTEGRATIONS.find(item => item.id === selectedConfig)?.name || 'Integration'}` : 'Connect New Integrations'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedConfig ? 'Enter required API details to connect service' : 'Explore available voice agent integrations & tools'}
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose} 
            className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 active:scale-95 shadow-sm flex items-center justify-center cursor-pointer"
            title="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          {!selectedConfig ? (
            // GRID VIEW
            <div className="space-y-6">
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-2 border-b border-white/5">
                <div className="flex flex-wrap items-center gap-2">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border transition-all cursor-pointer ${
                        activeCategory === cat.id 
                          ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-sm' 
                          : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/30 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {cat.id} <span className="opacity-60 ml-1 text-[0.68rem] bg-white/10 px-1.5 py-0.5 rounded-full">{cat.count}</span>
                    </button>
                  ))}
                </div>
                <div className="relative w-full md:w-64 shrink-0">
                  <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search integrations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#14141c] border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {filteredIntegrations.map((int, idx) => (
                  <div key={int.id || idx} className="bg-[#14141c] border border-white/10 hover:border-indigo-500/40 rounded-xl overflow-hidden flex flex-col group hover:shadow-lg hover:shadow-indigo-500/5 transition-all duration-200">
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${int.bg} border border-white/10 group-hover:scale-105 transition-transform flex items-center justify-center shrink-0`}>
                            <int.icon className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="font-bold text-white tracking-wide block text-sm">{int.name}</span>
                            <span className="text-[0.7rem] text-slate-400 block mt-0.5">{int.category}</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[0.62rem] font-bold tracking-wider uppercase border flex items-center gap-1 shrink-0 ${
                          int.tag === 'During Call' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                        }`}>
                          {int.tag}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                        {int.desc}
                      </p>
                    </div>
                    <div className="border-t border-white/5 p-3.5 px-5 flex justify-end bg-white/[0.02]">
                      <button 
                        onClick={() => setSelectedConfig(int.id)}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600/90 hover:bg-indigo-600 border border-indigo-500/30 rounded-lg text-xs font-bold text-white transition-all shadow-sm group-hover:shadow-indigo-500/20 cursor-pointer"
                      >
                        Connect <ExternalLink size={12} className="text-indigo-200 group-hover:text-white transition-colors" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // CONFIG FORMS
            <div className="space-y-6">
              {error && <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">{error}</div>}
              {success && <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">{success}</div>}

              {selectedConfig === 'calendly' && (
                <form onSubmit={handleCalendlySubmit} className="space-y-5">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Connect your Calendly account to allow your voice assistant to check your availability and schedule appointments seamlessly during a call.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Integration Name *</label>
                    <input required value={calendlyForm.name} onChange={e => setCalendlyForm({ ...calendlyForm, name: e.target.value })} placeholder="Integration name" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Personal Access Token *</label>
                    <input
                      type="text"
                      required
                      value={calendlyForm.token}
                      onChange={e => setCalendlyForm({ ...calendlyForm, token: e.target.value })}
                      placeholder="Enter your Calendly PAT..."
                      className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                    <p className="text-[0.65rem] text-slate-400 mt-2">
                      Get this from Calendly Settings &gt; Integrations &gt; API & Webhooks.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Event Type ID *</label>
                      <input required value={calendlyForm.eventTypeId} onChange={e => setCalendlyForm({ ...calendlyForm, eventTypeId: e.target.value })} placeholder="Event Type ID" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Timezone</label>
                      <input value={calendlyForm.timezone} onChange={e => setCalendlyForm({ ...calendlyForm, timezone: e.target.value })} placeholder="Timezone" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading || !calendlyForm.name || !calendlyForm.token || !calendlyForm.eventTypeId}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                      Connect Calendly
                    </button>
                  </div>
                </form>
              )}

              {selectedConfig === 'cal_com' && (
                <form onSubmit={handleCalComSubmit} className="space-y-5">
                  <p className="text-xs text-slate-400 leading-relaxed">Connect Cal.com so the Omni assistant can check availability and schedule appointments.</p>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Integration Name *</label>
                    <input required value={calComForm.name} onChange={e => setCalComForm({ ...calComForm, name: e.target.value })} placeholder="Integration name" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">API Key *</label>
                    <input required type="password" value={calComForm.apiKey} onChange={e => setCalComForm({ ...calComForm, apiKey: e.target.value })} placeholder="Cal.com API key" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Event Type ID *</label>
                      <input required value={calComForm.eventTypeId} onChange={e => setCalComForm({ ...calComForm, eventTypeId: e.target.value })} placeholder="Event Type ID" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Timezone</label>
                      <input value={calComForm.timezone} onChange={e => setCalComForm({ ...calComForm, timezone: e.target.value })} placeholder="Timezone" className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="pt-4 flex justify-end">
                    <button type="submit" disabled={loading} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer">
                      <Plug size={16} /> {loading ? 'Connecting...' : 'Connect Cal.com'}
                    </button>
                  </div>
                </form>
              )}

              {selectedConfig === 'custom_api' && (
                <form onSubmit={handleWebhookSubmit} className="space-y-5">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Connect to a custom API or webhook endpoint. Your voice assistant can trigger this endpoint to pass extracted data and trigger workflows.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Integration Name *</label>
                    <input
                      type="text" required
                      value={webhookForm.name}
                      onChange={e => setWebhookForm({ ...webhookForm, name: e.target.value })}
                      placeholder="e.g. My Custom CRM Data Webhook"
                      className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="col-span-1">
                      <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Method</label>
                      <select
                        value={webhookForm.method}
                        onChange={e => setWebhookForm({ ...webhookForm, method: e.target.value })}
                        className="w-full px-3 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option>POST</option>
                        <option>GET</option>
                        <option>PUT</option>
                        <option>PATCH</option>
                        <option>DELETE</option>
                      </select>
                    </div>
                    <div className="col-span-3">
                      <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">URL *</label>
                      <input
                        type="url" required
                        value={webhookForm.url}
                        onChange={e => setWebhookForm({ ...webhookForm, url: e.target.value })}
                        placeholder="https://api.example.com/webhook"
                        className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Headers (JSON)</label>
                    <textarea
                      value={webhookForm.headers}
                      onChange={e => setWebhookForm({ ...webhookForm, headers: e.target.value })}
                      placeholder='{"Authorization": "Bearer token", "Content-Type": "application/json"}'
                      className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white font-mono h-24 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wide">Body Template (JSON)</label>
                    <textarea
                      value={webhookForm.body}
                      onChange={e => setWebhookForm({ ...webhookForm, body: e.target.value })}
                      placeholder='{"event": "call_ended", "data": {}}'
                      className="w-full px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white font-mono h-24 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={loading || !webhookForm.name || !webhookForm.url}
                      className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                    >
                      {loading ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                      Connect Custom API
                    </button>
                  </div>
                </form>
              )}

              {!['calendly', 'cal_com', 'custom_api'].includes(selectedConfig) && (
                <form onSubmit={handleGenericSubmit} className="space-y-5">
                  <p className="text-xs text-slate-400 leading-relaxed">Paste the Omni Dimension integration payload for {INTEGRATIONS.find(item => item.id === selectedConfig)?.name || 'this integration'}. The payload is sent directly to the active Omni account.</p>
                  <textarea
                    required
                    value={genericForm}
                    onChange={event => setGenericForm(event.target.value)}
                    placeholder={'{"name":"My integration","type":"...","config":{}}'}
                    className="w-full min-h-56 px-4 py-3 bg-[#14141c] border border-white/10 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-indigo-500 resize-y"
                  />
                  <div className="pt-4 flex justify-end">
                    <button type="submit" disabled={loading || !genericForm.trim()} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer">
                      <Plug size={16} /> {loading ? 'Connecting...' : 'Connect Integration'}
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
