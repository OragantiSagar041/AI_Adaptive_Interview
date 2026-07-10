import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import {
  Radio, PhoneCall, Settings2, Activity, CheckCircle2, XCircle, Phone,
  BookOpen, Plug, Cog, MailCheck, Clock, Volume2, Globe, Zap, FileText,
  Mic, MessageSquare, RefreshCw, ChevronDown, ChevronUp, Timer,
  AlertCircle, User, Calendar, TrendingUp, Play, Plus, Trash2, Copy,
  ArrowUpRight, ArrowDownLeft, Upload
} from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import CallDetailsModal from './CallDetailsModal'
import IntegrationModal from './IntegrationModal'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>
  const s = status.toLowerCase()
  const map = {
    completed:  { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle2 size={11}/> },
    failed:     { bg: 'bg-rose-50 border-rose-200 text-rose-700',           icon: <XCircle size={11}/> },
    'no-answer':{ bg: 'bg-amber-50 border-amber-200 text-amber-700',        icon: <AlertCircle size={11}/> },
    busy:       { bg: 'bg-orange-50 border-orange-200 text-orange-700',     icon: <AlertCircle size={11}/> },
  }
  const style = map[s] || { bg: 'bg-blue-50 border-blue-200 text-blue-700', icon: <Activity size={11}/> }
  return (
    <span className={`inline-flex items-center gap-1 text-[0.68rem] font-bold border px-2 py-0.5 rounded-full ${style.bg}`}>
      {style.icon} {status.toUpperCase().replace('-', ' ')}
    </span>
  )
}

function TogglePill({ value }) {
  return (
    <div className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${value ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}>
      <div className="w-3 h-3 bg-white rounded-full shadow" />
    </div>
  )
}

function InfoRow({ label, value, mono = false }) {
  if (value === null || value === undefined || value === false || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/5 last:border-0">
      <span className="text-xs text-slate-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs font-semibold text-right text-slate-200 max-w-xs break-words ${mono ? 'font-mono text-[0.7rem]' : ''}`}>{String(value)}</span>
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      <span className="text-sm">Syncing from Omni Dimension...</span>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
      <Radio size={32} className="opacity-30" />
      <span className="text-sm">{message || 'No data found'}</span>
    </div>
  )
}

// ─── Tab Components ─────────────────────────────────────────────────────────────

function AssistantDetailsTab({ agentSettings, loading }) {
  if (loading) return <SectionLoader />
  if (!agentSettings) return <EmptyState message="No agent settings found. Check your Omni Dimension API key." />

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Languages', icon: <Globe size={14}/>, color: 'emerald', value: agentSettings.language || 'English' },
          { label: 'Voice (TTS)', icon: <Volume2 size={14}/>, color: 'indigo', value: `${agentSettings.tts_provider || 'Cartesia'} – ${agentSettings.tts_voice_id || 'Riya'}` },
          { label: 'AI Model', icon: <Zap size={14}/>, color: 'amber', value: agentSettings.llm_model || 'gpt-4o-mini' },
          { label: 'Transcription', icon: <Mic size={14}/>, color: 'rose', value: agentSettings.asr_provider || 'Soniox' },
        ].map(({ label, icon, color, value }) => (
          <div key={label} className={`bg-[#1a2333] border border-${color}-500/20 rounded-xl p-4`}>
            <div className={`flex items-center gap-2 mb-2 text-${color}-400`}>
              <div className={`p-1 bg-${color}-500/20 rounded`}>{icon}</div>
              <span className="text-xs font-bold uppercase tracking-wider">{label}</span>
            </div>
            <div className="font-semibold text-sm text-white">{value}</div>
          </div>
        ))}
      </div>

      {agentSettings.greeting_message && (
        <div className="bg-[#1a2333] border border-white/5 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 bg-white/5 border-b border-white/5">
            <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
              <MessageSquare size={14} /> Welcome Message
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><TogglePill value={true} /><span className="text-xs text-slate-400">Dynamic</span></div>
              <div className="flex items-center gap-1.5"><TogglePill value={true} /><span className="text-xs text-slate-400">Interruptible</span></div>
            </div>
          </div>
          <div className="px-5 py-4 text-sm text-slate-300 leading-relaxed bg-[#151b2b]">
            {agentSettings.greeting_message}
          </div>
        </div>
      )}

      {agentSettings.system_prompt && (
        <div className="bg-[#1a2333] border border-white/5 rounded-xl overflow-hidden">
          <div className="px-5 py-3 bg-white/5 border-b border-white/5 text-xs font-bold uppercase tracking-wider text-indigo-300">
            System Prompt (Preview)
          </div>
          <div className="px-5 py-4 text-xs text-slate-400 leading-relaxed max-h-48 overflow-y-auto bg-[#151b2b] font-mono">
            {agentSettings.system_prompt}
          </div>
        </div>
      )}
    </div>
  )
}

function CallConfigTab({ config, loading }) {
  if (loading) return <SectionLoader />
  if (!config) return <EmptyState message="No call configuration found." />

  const sections = [
    {
      title: 'Silence Handling',
      description: 'What happens when a caller goes quiet or stops responding',
      icon: <Timer size={18} />, color: 'blue',
      rows: [
        { label: 'Silence Timeout (ms)', value: config.silence_timeout },
        { label: 'User Idle Threshold (sec)', value: config.user_idle_threshold_sec },
        { label: 'Min Speech Duration (ms)', value: config.min_speech_duration_ms },
        { label: 'Idle Message 1', value: config.first_ideal_message },
        { label: 'Idle Message 2', value: config.second_ideal_message },
        { label: 'Final Idle Message', value: config.last_ideal_message },
      ]
    },
    {
      title: 'End Call Rules',
      description: 'Set conditions for when the assistant should hang up',
      icon: <XCircle size={18} />, color: 'rose',
      rows: [
        { label: 'End Call Enabled', value: config.is_end_call_enabled ? 'Yes' : 'No' },
        { label: 'Condition', value: config.end_call_condition },
        { label: 'End Message', value: config.end_call_message },
        { label: 'Max Duration (sec)', value: config.max_call_duration_in_sec ? `${config.max_call_duration_in_sec}s (${Math.round(config.max_call_duration_in_sec / 60)} min)` : null },
      ]
    },
    {
      title: 'Transfer & Routing',
      description: 'Route callers to phone numbers based on conditions',
      icon: <PhoneCall size={18} />, color: 'violet',
      rows: [
        { label: 'Transfer Enabled', value: config.is_transfer_enabled ? 'Yes' : 'No' },
      ]
    },
    {
      title: 'Response Behavior',
      description: 'Filler phrases and personality style',
      icon: <MessageSquare size={18} />, color: 'amber',
      rows: [
        { label: 'Speech Speed', value: config.speech_speed ? `${config.speech_speed}x` : null },
      ]
    },
    {
      title: 'Initial Ringing Sound',
      description: 'Play a ring tone until the agent says its first word',
      icon: <Phone size={18} />, color: 'emerald',
      rows: [
        { label: 'Ringing Sound Enabled', value: config.initial_ringing_sound_enabled ? 'Yes' : 'No' },
      ]
    },
    {
      title: 'Ambient Sound',
      description: 'Add background music or noise to calls',
      icon: <Volume2 size={18} />, color: 'cyan',
      rows: [
        { label: 'Background Noise Enabled', value: config.background_noise_enabled ? 'Yes' : 'No' },
        { label: 'Sound Type', value: config.background_noice_name?.replace('_', ' ') },
        { label: 'Volume', value: config.background_audio_volume != null ? `${Math.round(config.background_audio_volume * 100)}%` : null },
      ]
    },
    {
      title: 'Voicemail',
      description: 'Handle calls that reach voicemail',
      icon: <MailCheck size={18} />, color: 'orange',
      rows: [
        { label: 'Voicemail Enabled', value: config.voicemail_enabled ? 'Yes' : 'No' },
        { label: 'Voicemail Message', value: config.voicemail_message },
      ]
    },
  ]

  return (
    <div className="divide-y divide-white/5">
      {sections.map(({ title, description, icon, color, rows }) => {
        const hasData = rows.some(r => r.value !== null && r.value !== undefined && r.value !== false && r.value !== '')
        return (
          <div key={title} className="px-6 py-5 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start gap-4">
              <div className={`p-2 rounded-lg bg-${color}-500/10 text-${color}-400 mt-0.5 shrink-0`}>
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-white text-sm">{title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                {hasData && (
                  <div className="mt-3 bg-[#0f1620] rounded-lg px-4 py-1 divide-y divide-white/5">
                    {rows.map(r => <InfoRow key={r.label} label={r.label} value={r.value} />)}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KnowledgeBaseTab({ files, loading, onUpload, onRemove }) {
  const fileInputRef = useRef(null);

  if (loading) return <SectionLoader />
  return (
    <div className="p-6">
      
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-400" /> Knowledge Base
          </h3>
          <p className="text-slate-400 text-sm mt-1">Manage documents that give your AI specialized knowledge.</p>
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept=".pdf,.doc,.docx,.txt"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              if (onUpload) onUpload(e.target.files[0]);
              e.target.value = null; // reset
            }
          }}
        />
        <Button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600">
          <Upload size={16} /> Upload File
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 bg-[#0a0a0a] border border-[#222] rounded-xl">
          <BookOpen size={32} className="opacity-30" />
          <span className="text-sm">No knowledge base files uploaded yet.</span>
          <p className="text-xs text-slate-600 text-center max-w-sm">Upload PDFs, DOCX, or text files to give your AI agent specialized knowledge.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file, i) => (
            <div key={i} className="bg-[#111] border border-[#222] rounded-xl p-5 flex items-start justify-between gap-4 group">
              <div className="flex items-start gap-4 min-w-0">
                <div className="p-2 bg-indigo-500/20 rounded-lg">
                  <FileText size={20} className="text-indigo-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-white truncate">{file.name || file.file_name || 'Untitled'}</div>
                  <div className="text-xs text-slate-400 mt-1">{file.file_type || file.type || 'Document'}</div>
                  {file.size && <div className="text-xs text-slate-500 mt-0.5">{(file.size / 1024).toFixed(1)} KB</div>}
                </div>
              </div>
              <button 
                onClick={() => onRemove && onRemove(i)}
                className="text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                title="Remove file"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IntegrationsTab({ integrations, loading, onRefresh }) {
  const [showModal, setShowModal] = useState(false)
  const [detaching, setDetaching] = useState(null)

  const handleDetach = async (integrationId) => {
    if (!window.confirm('Are you sure you want to detach this integration?')) return
    
    setDetaching(integrationId)
    try {
      const token = localStorage.getItem('token')
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/detach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ integration_id: integrationId })
      })
      const data = await r.json()
      if (r.ok) {
        onRefresh()
      } else {
        alert(data.detail || 'Failed to detach integration')
      }
    } catch (err) {
      alert(err.message)
    } finally {
      setDetaching(null)
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-white">Integrations</h3>
          <p className="text-sm text-slate-400">Connect third-party services to your agent</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-lg transition-colors shadow-lg shadow-indigo-600/30"
        >
          <Plus size={16} /> Add Integration
        </button>
      </div>

      {loading ? (
        <SectionLoader />
      ) : integrations.length === 0 ? (
        <EmptyState message="No integrations connected to this agent." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((int) => (
            <div key={int.id} className="bg-[#1a2333] border border-white/10 rounded-xl p-5 relative group">
              <div className="flex items-start justify-between mb-3">
                <div className="p-2 bg-violet-500/20 rounded-lg">
                  <Plug size={18} className="text-violet-400" />
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${int.is_active ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-500/10 border-slate-500/30 text-slate-400'}`}>
                  {int.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="font-semibold text-sm text-white leading-tight pr-8">{int.name}</div>
              <div className="text-xs text-slate-400 mt-1.5 capitalize">{int.type?.replace('_', ' ')}</div>
              <div className="text-xs text-slate-600 mt-0.5 break-all">ID: {int.id}</div>
              
              <button
                onClick={() => handleDetach(int.id)}
                disabled={detaching === int.id}
                className="absolute right-4 top-14 p-2 text-rose-400/0 group-hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all disabled:opacity-50"
                title="Detach Integration"
              >
                {detaching === int.id ? <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={16} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <IntegrationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onRefresh={onRefresh}
      />
    </div>
  )
}

function PostCallTab({ configs, loading }) {
  if (loading) return <SectionLoader />
  if (!configs || configs.length === 0) return <EmptyState message="No post-call configurations found." />

  const deliveryIcons = {
    email: <MailCheck size={16} />,
    webhook: <Globe size={16} />,
    slack: <MessageSquare size={16} />,
    false: <Cog size={16} />,
  }

  return (
    <div className="p-6 space-y-5">
      {configs.map((cfg, i) => {
        const method = cfg.delivery_method || 'default'
        const icon = deliveryIcons[method] || deliveryIcons.false
        const statusList = cfg.trigger_call_statuses || []
        const vars = cfg.extracted_variables || []

        return (
          <div key={cfg.id || i} className="bg-[#1a2333] border border-white/10 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 bg-white/5 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-indigo-500/20 rounded-lg text-indigo-400">{icon}</div>
                <div>
                  <div className="font-bold text-sm text-white">
                    {cfg.destination && cfg.destination !== '' ? `→ ${cfg.destination}` : `Post-Call Config #${cfg.id}`}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Triggers on: {statusList.join(', ') || 'all statuses'}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Include Summary', value: cfg.include_summary },
                { label: 'Full Conversation', value: cfg.include_full_conversation },
                { label: 'Sentiment', value: cfg.include_sentiment },
                { label: 'Extracted Info', value: cfg.include_extracted_info },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center gap-1.5 py-3 bg-[#0f1620] rounded-lg">
                  <TogglePill value={value} />
                  <span className="text-[0.65rem] text-slate-400 text-center">{label}</span>
                </div>
              ))}
            </div>

            {vars.length > 0 && (
              <div className="px-5 pb-5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <TrendingUp size={12} /> Extracted Variables
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vars.map((v, vi) => (
                    <div key={vi} className="bg-[#0f1620] rounded-lg px-4 py-3 flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-emerald-400 font-mono">{v.key}</span>
                      <span className="text-xs text-slate-500">{v.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ScoreBar({ label, value, max = 10, color = 'indigo' }) {
  const pct = value != null ? Math.min(100, (parseFloat(value) / max) * 100) : 0
  const colorMap = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.6rem] text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color] || colorMap.indigo} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.6rem] text-slate-300 font-mono w-8 text-right">{value != null ? parseFloat(value).toFixed(1) : '—'}</span>
    </div>
  )
}

function RecentCallsTab({ calls, loading, onViewDetails }) {
  if (loading) return <SectionLoader />
  if (!calls || calls.length === 0) {
    return (
      <div className="p-6 max-w-[1200px] mx-auto">
        <div className="flex flex-col items-center justify-center bg-[#111111] border border-gray-800 rounded-2xl h-[450px] gap-5 text-gray-400 shadow-sm">
          <div className="p-4 bg-gray-800/50 rounded-full border border-gray-700">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2"/>
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48 0a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14"/>
            </svg>
          </div>
          <span className="text-[14px] font-medium tracking-wide">Previous calls will appear here</span>
        </div>
      </div>
    )
  }

  const formatDuration = (str) => {
    if (!str) return '00:00';
    if (str.includes(':')) {
      const parts = str.split(':');
      if (parts.length >= 3) {
         const m = parseInt(parts[1] || '0', 10).toString().padStart(2, '0');
         const s = parseInt(parts[2] || '0', 10).toString().padStart(2, '0');
         return `${m}:${s}`;
      } else if (parts.length === 2) {
         const m = parseInt(parts[0] || '0', 10).toString().padStart(2, '0');
         const s = parseInt(parts[1] || '0', 10).toString().padStart(2, '0');
         return `${m}:${s}`;
      }
    }
    return str;
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown Date';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month} ${day}, ${year} at ${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto bg-[#0a0a0a] min-h-screen">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-white font-bold mr-2">Recent Calls</span>
        <span className="text-gray-400 text-sm ml-auto mr-2">Filters <AlertCircle size={14} className="inline opacity-50" /></span>
        <select className="bg-[#111] border border-[#222] text-gray-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-cyan-500">
          <option>All directions</option>
          <option>Inbound</option>
          <option>Outbound</option>
        </select>
        <select className="bg-[#111] border border-[#222] text-gray-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-cyan-500">
          <option>All statuses</option>
          <option>Completed</option>
          <option>No Answer</option>
        </select>
        <select className="bg-[#111] border border-[#222] text-gray-300 text-sm rounded-lg px-3 py-1.5 outline-none focus:border-cyan-500">
          <option>All durations</option>
          <option>&gt; 5 min</option>
          <option>&lt; 5 min</option>
        </select>
        <button className="bg-[#111] border border-[#222] text-gray-300 hover:text-white text-sm rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Cards List */}
      <div className="flex flex-col gap-2">
        {calls.map((call, idx) => {
          const isCompleted = call.call_status === 'completed';
          const isOutbound = (call.call_direction || '').toLowerCase() === 'outbound';
          const badgeColor = isCompleted ? 'border-green-500/30 text-green-500' : 'border-red-500/30 text-red-500';
          
          return (
            <div 
              key={call.id || idx} 
              onClick={() => onViewDetails && onViewDetails(call.id)}
              className="bg-[#111] border border-[#222] rounded-lg p-3 flex items-center gap-4 text-sm font-mono text-gray-300 hover:border-gray-700 hover:bg-[#1a1a1a] transition-all cursor-pointer"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center">
                <Phone size={14} className="text-teal-500 opacity-80" />
              </div>
              
              {/* Info Column */}
              <div className="flex flex-col flex-1 gap-1.5">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${isOutbound ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                    {isOutbound ? <ArrowUpRight size={10} strokeWidth={3} /> : <ArrowDownLeft size={10} strokeWidth={3} />}
                    {isOutbound ? 'Outgoing' : 'Inbound'}
                  </span>
                  <span className="text-gray-100 font-semibold tracking-wide">
                    {call.from_number || '+Unknown'} <span className="text-gray-600 mx-1">→</span> {call.to_number || '+Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-[11px]">
                  <span>{formatDate(call.time_of_call)}</span>
                  <span>•</span>
                  <span>{formatDuration(call.call_duration)}</span>
                  <span className="px-1.5 py-0.5 rounded border border-teal-500/30 text-teal-500 ml-2">
                    {call.call_type || 'Test-Call'}
                  </span>
                </div>
              </div>
              
              {/* Right Column */}
              <div className="flex flex-col items-end gap-1.5 ml-auto">
                <div className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] px-2 py-1 rounded text-xs text-gray-400 font-mono">
                  ID: #{call.id}
                  <Copy size={12} className="cursor-pointer hover:text-white transition-colors" />
                </div>
                <div className={`px-2 py-0.5 rounded border text-[10px] uppercase font-bold tracking-widest ${badgeColor}`}>
                  {call.call_status || 'unknown'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function AICallingAgentPage() {
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const token = useSelector(state => state.auth.token)

  const [activeTab, setActiveTab] = useState('assistant')
  const [selectedCallId, setSelectedCallId] = useState(null)

  // Data states
  const [agentSettings, setAgentSettings] = useState(null)
  const [callConfig, setCallConfig]     = useState(null)
  const [knowledgeBase, setKnowledgeBase] = useState([])
  const [integrations, setIntegrations]   = useState([])
  const [postCallConfigs, setPostCallConfigs] = useState([])
  const [recentCalls, setRecentCalls]     = useState([])

  // Loading states
  const [loadingMap, setLoadingMap] = useState({
    assistant: false, callconfig: false, knowledgebase: false,
    integrations: false, postcall: false, recentcalls: false
  })

  // Manual dialer state
  const [manualCall, setManualCall] = useState({ phone: '', name: '', jobDesc: '', resume: null })
  const [isCalling, setIsCalling] = useState(false)

  const headers = { Authorization: `Bearer ${token}` }

  const setLoading = (key, val) => setLoadingMap(m => ({ ...m, [key]: val }))

  const fetchAssistant = async () => {
    if (agentSettings) return
    setLoading('assistant', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/agent-settings`, { headers })
      const d = await r.json()
      if (r.ok) setAgentSettings(d.settings)
    } catch(e) { console.error(e) } finally { setLoading('assistant', false) }
  }

  const fetchCallConfig = async () => {
    if (callConfig) return
    setLoading('callconfig', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/call-config`, { headers })
      const d = await r.json()
      if (r.ok) setCallConfig(d.config)
    } catch(e) { console.error(e) } finally { setLoading('callconfig', false) }
  }

  const fetchKnowledgeBase = async () => {
    setLoading('knowledgebase', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/knowledge-base`, { headers })
      const d = await r.json()
      if (r.ok) setKnowledgeBase(d.files || [])
    } catch(e) { console.error(e) } finally { setLoading('knowledgebase', false) }
  }

  const fetchIntegrations = async () => {
    if (integrations.length) return
    setLoading('integrations', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations`, { headers })
      const d = await r.json()
      if (r.ok) setIntegrations(d.integrations || [])
    } catch(e) { console.error(e) } finally { setLoading('integrations', false) }
  }

  const fetchPostCall = async () => {
    if (postCallConfigs.length) return
    setLoading('postcall', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/post-call-config`, { headers })
      const d = await r.json()
      if (r.ok) setPostCallConfigs(d.post_call_configs || [])
    } catch(e) { console.error(e) } finally { setLoading('postcall', false) }
  }

  const fetchRecentCalls = async () => {
    setLoading('recentcalls', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/recent-calls`, { headers })
      const d = await r.json()
      if (r.ok && d.calls) {
        setRecentCalls(d.calls)
      } else {
        setRecentCalls([])
      }
    } catch(e) {
      console.error(e)
      setRecentCalls([])
    } finally { setLoading('recentcalls', false) }
  }

  useEffect(() => {
    const fetchMap = {
      assistant: fetchAssistant,
      callconfig: fetchCallConfig,
      knowledgebase: fetchKnowledgeBase,
      integrations: fetchIntegrations,
      postcall: fetchPostCall,
      recentcalls: fetchRecentCalls,
    }
    if (fetchMap[activeTab]) fetchMap[activeTab]()
  }, [activeTab])

  const handleManualCall = async () => {
    if (!manualCall.phone) { alert('Please enter a phone number'); return }
    setIsCalling(true)
    try {
      const formData = new FormData()
      formData.append('phone_number', manualCall.phone)
      formData.append('candidate_name', manualCall.name || 'Candidate')
      formData.append('job_description', manualCall.jobDesc)
      if (manualCall.resume) formData.append('resume', manualCall.resume)
      const r = await fetch(`${API_BASE_URL}/api/calls/initiate-manual`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      const d = await r.json()
      if (r.ok) { alert(d.message || 'Call initiated!'); setManualCall({ phone: '', name: '', jobDesc: '', resume: null }) }
      else alert('Failed: ' + (d.detail || 'Unknown error'))
    } catch(e) { alert('Error: ' + e.message) } finally { setIsCalling(false) }
  }

  const TABS = [
    { id: 'assistant',    label: 'Assistant Details',  icon: <Radio size={15}/> },
    { id: 'callconfig',   label: 'Call Configuration', icon: <Cog size={15}/> },
    { id: 'knowledgebase',label: 'Knowledge Base',     icon: <BookOpen size={15}/> },
    { id: 'integrations', label: 'Integrations',       icon: <Plug size={15}/> },
    { id: 'postcall',     label: 'Post-Call',          icon: <MailCheck size={15}/> },
    { id: 'recentcalls',  label: 'Recent Calls',       icon: <Clock size={15}/> },
    { id: 'dialer',       label: 'Manual Dialer',      icon: <Phone size={15}/> },
  ]

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 animate-fade-in pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold tracking-wide uppercase mb-3">
            <Radio size={14} className="animate-pulse" /> Omni Dimension Integration
          </div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">AI Calling Agent</h1>
          <p className="text-slate-500 mt-2 max-w-2xl text-sm">
            Live sync of your Omni Dimension AI Voice Agent — knowledge base, integrations, call configuration, post-call settings, and recent calls.
          </p>
        </div>
      </div>

      {/* Dark card wrapping tabs + content */}
      <div className="bg-[#0d1117] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-4 pt-4 overflow-x-auto scrollbar-none border-b border-white/10 bg-[#111827]">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-t-lg transition-all whitespace-nowrap border-b-2 -mb-px ${
                activeTab === id
                  ? 'border-indigo-500 text-indigo-400 bg-[#0d1117]'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-h-[400px]">
          {activeTab === 'assistant' && (
            <AssistantDetailsTab agentSettings={agentSettings} loading={loadingMap.assistant} />
          )}
          {activeTab === 'callconfig' && (
            <CallConfigTab config={callConfig} loading={loadingMap.callconfig} />
          )}
          {activeTab === 'knowledgebase' && (
            <KnowledgeBaseTab 
              files={knowledgeBase} 
              loading={loadingMap.knowledgebase} 
              onUpload={(file) => {
                // Here you would implement the actual file upload logic via a multipart POST request
                console.log("Uploading file:", file.name);
                // Mocking an immediate local update to the UI for demonstration purposes
                setKnowledgeBase([...knowledgeBase, {
                  name: file.name,
                  file_type: file.type,
                  size: file.size
                }]);
              }}
              onRemove={(index) => {
                const newKb = [...knowledgeBase];
                newKb.splice(index, 1);
                setKnowledgeBase(newKb);
              }}
            />
          )}
          {activeTab === 'integrations' && (
            <IntegrationsTab 
              integrations={integrations} 
              loading={loadingMap.integrations} 
              onRefresh={() => {
                const fetchIntegrations = async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
                    const r = await fetch(`${API_BASE_URL}/api/calls/integrations`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    const d = await r.json();
                    if (r.ok) setIntegrations(d.integrations || []);
                  } catch (e) { console.error(e) }
                };
                fetchIntegrations();
              }} 
            />
          )}
          {activeTab === 'postcall' && (
            <PostCallTab configs={postCallConfigs} loading={loadingMap.postcall} />
          )}
          {activeTab === 'recentcalls' && (
            <RecentCallsTab
              calls={recentCalls}
              loading={loadingMap.recentcalls}
              onViewDetails={setSelectedCallId}
            />
          )}
          {activeTab === 'dialer' && (
            <div className="p-6 max-w-2xl mx-auto">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Phone size={20} className="text-indigo-400" /> Manual Dialer
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  Initiate an outbound AI call manually with a phone number and candidate context.
                </p>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">Phone Number *</label>
                    <input
                      type="text" value={manualCall.phone}
                      onChange={e => setManualCall({...manualCall, phone: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#1a2333] border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      placeholder="+91 99999 00000"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">Candidate Name</label>
                    <input
                      type="text" value={manualCall.name}
                      onChange={e => setManualCall({...manualCall, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-[#1a2333] border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                      placeholder="e.g. John Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Job Description</label>
                  <textarea
                    value={manualCall.jobDesc}
                    onChange={e => setManualCall({...manualCall, jobDesc: e.target.value})}
                    className="w-full px-4 py-3 bg-[#1a2333] border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 h-24 resize-none"
                    placeholder="Paste job description or role requirements..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">Resume (PDF/DOCX)</label>
                  <input
                    type="file" accept=".pdf,.doc,.docx"
                    onChange={e => setManualCall({...manualCall, resume: e.target.files[0]})}
                    className="w-full px-4 py-2.5 bg-[#1a2333] border border-white/10 rounded-lg text-sm text-slate-400 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700"
                  />
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleManualCall}
                    disabled={isCalling || !manualCall.phone}
                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors shadow-lg shadow-indigo-600/30"
                  >
                    {isCalling ? <><Activity size={15} className="animate-spin" /> Calling...</> : <><Phone size={15}/> Start AI Call</>}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

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
