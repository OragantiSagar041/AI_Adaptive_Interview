import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { API_BASE_URL } from '../../apiConfig'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio, PhoneCall, Settings2, Activity, CheckCircle2, XCircle, Phone,
  BookOpen, Plug, Cog, MailCheck, Clock, Volume2, Globe, Zap, FileText,
  Mic, MessageSquare, RefreshCw, ChevronDown, ChevronUp, Timer,
  AlertCircle, User, Calendar, TrendingUp, Play, Plus, Trash2, Copy,
  ArrowUpRight, ArrowDownLeft, Upload, Search, Filter, Users, Settings, 
  CheckCircle, Eye, Brain, X
} from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import CallDetailsModal from './CallDetailsModal'
import IntegrationModal from './IntegrationModal'
import { parseDateStringToUtc } from '../../utils/adminFormatters'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>
  const s = status.toLowerCase()
  const map = {
    completed: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle2 size={11} /> },
    failed: { bg: 'bg-rose-50 border-rose-200 text-rose-700', icon: <XCircle size={11} /> },
    'no-answer': { bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: <AlertCircle size={11} /> },
    busy: { bg: 'bg-orange-50 border-orange-200 text-orange-700', icon: <AlertCircle size={11} /> },
  }
  const style = map[s] || { bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: <Activity size={11} /> }
  return (
    <span className={`inline-flex items-center gap-1 text-[0.68rem] font-bold border px-2 py-0.5 rounded-full ${style.bg}`}>
      {style.icon} {status.toUpperCase().replace('-', ' ')}
    </span>
  )
}

function TogglePill({ value }) {
  return (
    <div className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${value ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
      <div className="w-3 h-3 bg-white rounded-full shadow-sm" />
    </div>
  )
}

function InfoRow({ label, value, mono = false }) {
  if (value === null || value === undefined || value === false || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-500 shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs font-semibold text-right text-slate-800 max-w-xs break-words ${mono ? 'font-mono text-[0.7rem]' : ''}`}>{String(value)}</span>
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      <span className="text-sm font-medium">Syncing from Omni Dimension...</span>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
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
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Languages', icon: <Globe size={14} />, color: 'emerald', value: agentSettings.language || 'English' },
          { label: 'Voice (TTS)', icon: <Volume2 size={14} />, color: 'indigo', value: `${agentSettings.tts_provider || 'Cartesia'} – ${agentSettings.tts_voice_id || 'Riya'}` },
          { label: 'AI Model', icon: <Zap size={14} />, color: 'amber', value: agentSettings.llm_model || 'gpt-4o-mini' },
          { label: 'Transcription', icon: <Mic size={14} />, color: 'rose', value: agentSettings.asr_provider || 'Soniox' },
        ].map(({ label, icon, color, value }, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" }}
            key={label} 
            className={`bg-white border border-slate-200 hover:border-${color}-300 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all group`}
          >
            <div className={`flex items-center gap-2 mb-3 text-${color}-600`}>
              <div className={`p-1.5 bg-${color}-50 rounded-lg group-hover:scale-110 transition-transform`}>{icon}</div>
              <span className="text-[0.65rem] font-extrabold uppercase tracking-widest">{label}</span>
            </div>
            <div className="font-semibold text-sm text-slate-800">{value}</div>
          </motion.div>
        ))}
      </div>

      {agentSettings.greeting_message && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-colors shadow-sm"
        >
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold uppercase tracking-wider">
              <MessageSquare size={14} /> Welcome Message
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5"><TogglePill value={true} /><span className="text-[0.7rem] font-bold tracking-wide text-slate-500 uppercase">Dynamic</span></div>
              <div className="flex items-center gap-1.5"><TogglePill value={true} /><span className="text-[0.7rem] font-bold tracking-wide text-slate-500 uppercase">Interruptible</span></div>
            </div>
          </div>
          <div className="px-5 py-5 text-sm text-slate-700 leading-relaxed bg-white">
            {agentSettings.greeting_message}
          </div>
        </motion.div>
      )}

      {agentSettings.system_prompt && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-colors shadow-sm"
        >
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-600">
            <FileText size={14} /> System Prompt (Preview)
          </div>
          <div className="px-5 py-5 text-[0.8rem] text-slate-600 leading-relaxed max-h-60 overflow-y-auto bg-white font-mono scrollbar-none border-t border-slate-100">
            {agentSettings.system_prompt}
          </div>
        </motion.div>
      )}
    </div>
  )
}

function ModeSwitch({ isDynamic, onChange }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold select-none">
      <span className={!isDynamic ? "text-slate-800 font-bold" : "text-slate-400"}>Static</span>
      <button
        type="button"
        onClick={() => onChange(!isDynamic)}
        className={`w-9 h-4.5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
          isDynamic ? "bg-indigo-600 justify-end" : "bg-slate-300 justify-start"
        }`}
      >
        <div className="w-3.5 h-3.5 bg-white rounded-full shadow-md" />
      </button>
      <span className={isDynamic ? "text-indigo-600 font-bold" : "text-slate-400"}>Dynamic</span>
    </div>
  )
}

function CyanToggleSwitch({ checked, onChange, label = "" }) {
  return (
    <div className="flex items-center gap-2.5 select-none cursor-pointer" onClick={() => onChange(!checked)}>
      {label && <span className={`text-xs font-bold ${checked ? "text-slate-800" : "text-slate-400"}`}>{label}</span>}
      <div className={`w-9 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
        checked ? "bg-indigo-600 justify-end" : "bg-slate-300 justify-start"
      }`}>
        <div className="w-3.5 h-3.5 bg-white rounded-full shadow-md" />
      </div>
    </div>
  )
}

function CallConfigTab({ config, loading, omniApiKey, onRefresh }) {
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')
  const [saveError, setSaveError] = useState('')

  const [openSilence, setOpenSilence] = useState(true)
  const [openEndCall, setOpenEndCall] = useState(true)
  const [openResponse, setOpenResponse] = useState(true)

  const c = config || {}

  const [formData, setFormData] = useState(() => ({
    user_idle_threshold_sec: c.user_idle_threshold_sec ?? 10,
    first_idle_dynamic: c.first_idle_dynamic ?? true,
    first_ideal_message: c.first_ideal_message || "Are you still there?",
    second_idle_dynamic: c.second_idle_dynamic ?? true,
    second_ideal_message: c.second_ideal_message || "I am still here if you need any help.",
    last_ideal_message: c.last_ideal_message || "I'll leave you for now. Have a nice day!",

    max_call_duration_in_sec: c.max_call_duration_in_sec ?? 600,
    is_end_call_enabled: c.is_end_call_enabled ?? true,
    end_call_condition: c.end_call_condition || "End the call when the user says goodbye, thank you, or indicates they are done with the conversation",
    end_call_message: c.end_call_message || "Thank you for speaking with me today. Goodbye!",

    speech_speed: c.speech_speed ?? 1.0,
    initial_ringing_sound_enabled: c.initial_ringing_sound_enabled ?? true,
    is_transfer_enabled: c.is_transfer_enabled ?? false,
    background_noise_enabled: c.background_noise_enabled ?? false,
    background_noice_name: typeof c.background_noice_name === 'string' ? c.background_noice_name : 'office_ambiance',
    background_audio_volume: c.background_audio_volume ?? 0.15,
    voicemail_enabled: c.voicemail_enabled ?? false,
    voicemail_message: c.voicemail_message || "Hi, I reached your voicemail. Please call back when available.",
  }))

  useEffect(() => {
    if (config && typeof config === 'object' && Object.keys(config).length > 0) {
      setFormData({
        user_idle_threshold_sec: config.user_idle_threshold_sec ?? 10,
        first_idle_dynamic: config.first_idle_dynamic ?? true,
        first_ideal_message: config.first_ideal_message || "Are you still there?",
        second_idle_dynamic: config.second_idle_dynamic ?? true,
        second_ideal_message: config.second_ideal_message || "I am still here if you need any help.",
        last_ideal_message: config.last_ideal_message || "I'll leave you for now. Have a nice day!",

        max_call_duration_in_sec: config.max_call_duration_in_sec ?? 600,
        is_end_call_enabled: config.is_end_call_enabled ?? true,
        end_call_condition: config.end_call_condition || "End the call when the user says goodbye, thank you, or indicates they are done with the conversation",
        end_call_message: config.end_call_message || "Thank you for speaking with me today. Goodbye!",

        speech_speed: config.speech_speed ?? 1.0,
        initial_ringing_sound_enabled: config.initial_ringing_sound_enabled ?? true,
        is_transfer_enabled: config.is_transfer_enabled ?? false,
        background_noise_enabled: config.background_noise_enabled ?? false,
        background_noice_name: typeof config.background_noice_name === 'string' ? config.background_noice_name : 'office_ambiance',
        background_audio_volume: config.background_audio_volume ?? 0.15,
        voicemail_enabled: config.voicemail_enabled ?? false,
        voicemail_message: config.voicemail_message || "Hi, I reached your voicemail. Please call back when available.",
      })
    }
  }, [config])

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    setSaveSuccess('')
    setSaveError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE_URL}/api/calls/call-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {}),
        },
        body: JSON.stringify(formData)
      })
      const data = await res.json()
      if (res.ok) {
        setSaveSuccess('Call Configuration updated & synced to Omni Dimension!')
        if (onRefresh) onRefresh()
        setTimeout(() => setSaveSuccess(''), 3000)
      } else {
        setSaveError(data.detail || 'Failed to update call configuration')
      }
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SectionLoader />

  return (
    <form onSubmit={handleSaveConfig} className="space-y-5 max-w-5xl mx-auto text-slate-800">
      {/* Alert Messages */}
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <span>{saveSuccess}</span>
          <CheckCircle2 size={16} />
        </div>
      )}
      {saveError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold flex items-center justify-between animate-in fade-in">
          <span>{saveError}</span>
          <XCircle size={16} />
        </div>
      )}

      {/* Top Header bar */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200">
        <div>
          <h3 className="font-extrabold text-xl text-slate-800 tracking-tight flex items-center gap-2">
            <Cog size={22} className="text-indigo-600" /> Call Configuration
          </h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">Manage live agent silence rules, end-call conditions, ambient audio, and voicemail.</p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* SECTION 1: Silence Handling */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div 
          onClick={() => setOpenSilence(!openSilence)}
          className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200 cursor-pointer select-none hover:bg-slate-100/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Timer size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800">Silence Handling</h4>
              <p className="text-xs text-slate-500">What happens when a caller goes quiet or stops responding</p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600">
            {openSilence ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openSilence && (
          <div className="p-6 space-y-6 bg-white">
            {/* User idle threshold */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-0.5">User idle threshold</label>
                <p className="text-[0.72rem] text-slate-500">How long to wait before the agent nudges a silent caller.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={formData.user_idle_threshold_sec}
                  onChange={e => handleChange('user_idle_threshold_sec', parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 text-right focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-500">sec</span>
              </div>
            </div>

            {/* Idle messages heading */}
            <div>
              <div className="text-xs font-bold tracking-wide uppercase text-slate-500 mb-4">Idle messages (what the agent says)</div>
              
              {/* First Idle Message */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">First idle message</span>
                  <ModeSwitch 
                    isDynamic={formData.first_idle_dynamic} 
                    onChange={val => handleChange('first_idle_dynamic', val)} 
                  />
                </div>
                <p className="text-[0.7rem] text-slate-500">Generated live in the ongoing language if the caller is silent for {formData.user_idle_threshold_sec} seconds.</p>
                {!formData.first_idle_dynamic && (
                  <input
                    type="text"
                    value={formData.first_ideal_message}
                    onChange={e => handleChange('first_ideal_message', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {/* Second Idle Message */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Second idle message</span>
                  <ModeSwitch 
                    isDynamic={formData.second_idle_dynamic} 
                    onChange={val => handleChange('second_idle_dynamic', val)} 
                  />
                </div>
                <p className="text-[0.7rem] text-slate-500">Generated live in the ongoing language if the caller stays silent another {formData.user_idle_threshold_sec} seconds.</p>
                {!formData.second_idle_dynamic && (
                  <input
                    type="text"
                    value={formData.second_ideal_message}
                    onChange={e => handleChange('second_ideal_message', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {/* Last Idle Message */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Last idle message</span>
                <input
                  type="text"
                  value={formData.last_ideal_message}
                  onChange={e => handleChange('last_ideal_message', e.target.value)}
                  placeholder="I'll leave you for now. Have a nice day!"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                />
                <p className="text-[0.7rem] text-slate-500">Spoken after a final {formData.user_idle_threshold_sec} seconds of silence, then the call hangs up automatically.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: End Call Rules */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div 
          onClick={() => setOpenEndCall(!openEndCall)}
          className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200 cursor-pointer select-none hover:bg-slate-100/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-600">
              <XCircle size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800">End Call Rules</h4>
              <p className="text-xs text-slate-500">Set conditions for when the assistant should hang up</p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600">
            {openEndCall ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openEndCall && (
          <div className="p-6 space-y-6 bg-white">
            {/* Max Call Duration */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-0.5 flex items-center gap-1">
                  Max Call Duration (sec) <span className="text-slate-400 text-[0.65rem]">ⓘ</span>
                </label>
                <p className="text-[0.72rem] text-slate-500">The maximum duration in seconds before the call is automatically ended.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={formData.max_call_duration_in_sec}
                  onChange={e => handleChange('max_call_duration_in_sec', parseInt(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 text-right focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-500">Second(s)</span>
              </div>
            </div>

            {/* Enable Automatic Call Ending */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-0.5">Enable Automatic Call Ending</label>
                <p className="text-[0.72rem] text-slate-500">Allow your agent to automatically end calls based on specific conditions</p>
              </div>
              <CyanToggleSwitch 
                checked={formData.is_end_call_enabled} 
                onChange={val => handleChange('is_end_call_enabled', val)} 
                label={formData.is_end_call_enabled ? "Enabled" : "Disabled"}
              />
            </div>

            {/* End Call Settings */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-500 uppercase">End Call Settings</div>
              
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">End Call Condition *</label>
                <input
                  type="text"
                  value={formData.end_call_condition}
                  onChange={e => handleChange('end_call_condition', e.target.value)}
                  placeholder="End the call when the user says goodbye, thank you, or indicates they are done with the conversation"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">End Call Goodbye Message</label>
                <input
                  type="text"
                  value={formData.end_call_message}
                  onChange={e => handleChange('end_call_message', e.target.value)}
                  placeholder="Thank you for speaking with me today. Goodbye!"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Response & Ambient Noise */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div 
          onClick={() => setOpenResponse(!openResponse)}
          className="flex items-center justify-between px-6 py-4 bg-slate-50/80 border-b border-slate-200 cursor-pointer select-none hover:bg-slate-100/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-600">
              <Volume2 size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800">Response Behavior & Ambient Audio</h4>
              <p className="text-xs text-slate-500">Speech speed, ring tones, ambient noise, and voicemail detection</p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600">
            {openResponse ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openResponse && (
          <div className="p-6 space-y-6 bg-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">Speech Speed ({formData.speech_speed}x)</label>
                <input
                  type="range" min="0.7" max="1.3" step="0.05"
                  value={formData.speech_speed}
                  onChange={e => handleChange('speech_speed', parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-0.5">Initial Ringing Sound</label>
                  <p className="text-[0.72rem] text-slate-500">Play ring tone before agent speaks first word</p>
                </div>
                <CyanToggleSwitch 
                  checked={formData.initial_ringing_sound_enabled} 
                  onChange={val => handleChange('initial_ringing_sound_enabled', val)} 
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">Background Ambient Noise</label>
                  <CyanToggleSwitch 
                    checked={formData.background_noise_enabled} 
                    onChange={val => handleChange('background_noise_enabled', val)} 
                  />
                </div>
                {formData.background_noise_enabled && (
                  <div className="space-y-3 pt-1">
                    <select
                      value={formData.background_noice_name}
                      onChange={e => handleChange('background_noice_name', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="office_ambiance">Office Ambiance</option>
                      <option value="call_center">Call Center Noise</option>
                      <option value="cafe_sound">Cafe / Soft Coffee Shop</option>
                      <option value="white_noise">Subtle White Noise</option>
                    </select>
                    <div>
                      <span className="text-[0.7rem] text-slate-500 font-bold block mb-1">Volume ({Math.round(formData.background_audio_volume * 100)}%)</span>
                      <input
                        type="range" min="0.05" max="0.5" step="0.05"
                        value={formData.background_audio_volume}
                        onChange={e => handleChange('background_audio_volume', parseFloat(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">Voicemail Detection</label>
                  <CyanToggleSwitch 
                    checked={formData.voicemail_enabled} 
                    onChange={val => handleChange('voicemail_enabled', val)} 
                  />
                </div>
                {formData.voicemail_enabled && (
                  <input
                    type="text"
                    value={formData.voicemail_message}
                    onChange={e => handleChange('voicemail_message', e.target.value)}
                    placeholder="Hi, I reached your voicemail. Please call back when available."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-7 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {saving ? 'Saving...' : 'Save Call Configuration'}
        </button>
      </div>
    </form>
  )
}

function KnowledgeBaseTab({ files, loading, onUpload, onRemove }) {
  const fileInputRef = useRef(null);

  if (loading) return <SectionLoader />
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-500" /> Knowledge Base
          </h3>
          <p className="text-slate-500 text-sm mt-1">Manage documents that give your AI specialized knowledge.</p>
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
        <Button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-md">
          <Upload size={16} /> Upload File
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <BookOpen size={32} className="opacity-30 text-indigo-400" />
          <span className="text-sm font-semibold">No knowledge base files uploaded yet.</span>
          <p className="text-xs text-slate-400 text-center max-w-sm">Upload PDFs, DOCX, or text files to give your AI agent specialized knowledge.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4 group shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
              <div className="flex items-start gap-4 min-w-0">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-500">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-slate-800 truncate">{file.name || file.file_name || 'Untitled'}</div>
                  <div className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mt-1">{file.file_type || file.type || 'Document'}</div>
                  {file.size && <div className="text-xs text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB</div>}
                </div>
              </div>
              <button
                onClick={() => onRemove && onRemove(i)}
                className="text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100 p-1.5 rounded-md"
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

const OMNI_INTEGRATIONS_CATALOG = [
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

function IntegrationsTab({ integrations, loading, onRefresh }) {
  const [showModal, setShowModal] = useState(false)
  const [selectedIntId, setSelectedIntId] = useState(null)
  const [detaching, setDetaching] = useState(null)
  const [activeCategory, setActiveCategory] = useState('All')

  const handleDetach = async (integrationId) => {
    if (!window.confirm('Are you sure you want to detach this integration?')) return

    setDetaching(integrationId)
    try {
      const token = localStorage.getItem('token')
      const omniApiKey = sessionStorage.getItem('omniDimensionApiKey') || ''
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations/detach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {})
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

  const openConnectModal = (intId = null) => {
    setSelectedIntId(intId)
    setShowModal(true)
  }

  const filteredCatalog = OMNI_INTEGRATIONS_CATALOG.filter(int => {
    if (activeCategory === 'All') return true
    return int.category === activeCategory
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 tracking-tight">
            <Plug size={20} className="text-indigo-600" /> Omni Dimension Integrations
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Live sync your Omni Dimension AI Voice Agent with CRM, calendar scheduling, webhooks, and messaging tools.</p>
        </div>
        <button
          onClick={() => openConnectModal(null)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 cursor-pointer shrink-0"
        >
          <Plus size={16} /> Add Integration
        </button>
      </div>

      {/* Section 1: Connected Active Integrations */}
      {integrations && integrations.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-500" /> Active Connected Integrations ({integrations.length})
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((int) => (
              <div key={int.id} className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 relative group hover:border-indigo-300 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
                    <Plug size={16} />
                  </div>
                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 uppercase tracking-wider">
                    Connected
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-800 leading-tight pr-8">{int.name}</div>
                <div className="text-[0.7rem] font-bold text-indigo-600 uppercase tracking-wider mt-1">{int.type?.replace('_', ' ')}</div>
                <div className="text-[0.65rem] font-mono text-slate-400 mt-1 truncate">ID: {int.id}</div>

                <button
                  onClick={() => handleDetach(int.id)}
                  disabled={detaching === int.id}
                  className="absolute right-3 top-3 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-50 cursor-pointer"
                  title="Detach Integration"
                >
                  {detaching === int.id ? <RefreshCw size={14} className="animate-spin text-rose-500" /> : <Trash2 size={15} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Omni Dimension Available Integrations Catalog */}
      <div className="space-y-4">
        {/* Category Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {['All', 'Calendar & CRM', 'Messaging', 'Data & Sheets', 'Custom & Tools'].map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide border transition-all cursor-pointer ${
                activeCategory === cat 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm font-bold' 
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Catalog Grid */}
        {loading ? (
          <SectionLoader />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCatalog.map((int, idx) => (
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
                    onClick={() => openConnectModal(int.id)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-600 transition-colors group-hover:border-indigo-300 cursor-pointer"
                  >
                    Connect <ExternalLink size={12} className="text-indigo-400 group-hover:text-indigo-600 transition-colors" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Integration Modal */}
      <IntegrationModal
        isOpen={showModal}
        initialConfig={selectedIntId}
        onClose={() => { setShowModal(false); setSelectedIntId(null); }}
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
    <div className="space-y-5">
      {configs.map((cfg, i) => {
        const method = cfg.delivery_method || 'default'
        const icon = deliveryIcons[method] || deliveryIcons.false
        const statusList = cfg.trigger_call_statuses || []
        const vars = cfg.extracted_variables || []

        return (
          <div key={cfg.id || i} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-600">{icon}</div>
                <div>
                  <div className="font-bold text-sm text-slate-800">
                    {cfg.destination && cfg.destination !== '' ? `→ ${cfg.destination}` : `Post-Call Config #${cfg.id}`}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5 uppercase tracking-wide">
                    Triggers on: <span className="text-indigo-500">{statusList.join(', ') || 'all statuses'}</span>
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
                <div key={label} className="flex flex-col items-center gap-1.5 py-3 bg-slate-50 border border-slate-100 rounded-xl shadow-[inset_0_1px_3px_rgba(0,0,0,0.02)]">
                  <TogglePill value={value} />
                  <span className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-500 text-center">{label}</span>
                </div>
              ))}
            </div>

            {vars.length > 0 && (
              <div className="px-5 pb-5">
                <div className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <TrendingUp size={14} className="text-indigo-500" /> Extracted Variables
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {vars.map((v, vi) => (
                    <div key={vi} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 flex flex-col gap-0.5 shadow-sm">
                      <span className="text-xs font-bold text-indigo-600 font-mono">{v.key}</span>
                      <span className="text-[0.75rem] text-slate-600">{v.description}</span>
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
      <span className="text-[0.6rem] text-slate-500 w-20 shrink-0 font-bold uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color] || colorMap.indigo} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.65rem] text-slate-700 font-bold font-mono w-8 text-right">{value != null ? parseFloat(value).toFixed(1) : '—'}</span>
    </div>
  )
}

function RecentCallsTab({ calls, loading, onViewDetails }) {
  if (loading) return <SectionLoader />
  if (!calls || calls.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col items-center justify-center bg-white border border-slate-200 rounded-3xl h-[400px] gap-5 text-slate-400 shadow-sm">
          <div className="p-4 bg-indigo-50 rounded-full border border-indigo-100 text-indigo-400">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48 0a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-500 tracking-wide">Previous calls will appear here</span>
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown Date';
    try {
      const date = parseDateStringToUtc(dateString)
      if (!date || Number.isNaN(date.getTime())) return dateString
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'long',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    } catch (e) {
      return dateString
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto min-h-[500px]">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-6 bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex-wrap">
        <span className="text-slate-800 font-extrabold mr-2 ml-2">Recent Calls</span>
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider ml-auto mr-2">Filters <AlertCircle size={14} className="inline opacity-50" /></span>
        <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500">
          <option>All directions</option>
          <option>Inbound</option>
          <option>Outbound</option>
        </select>
        <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500">
          <option>All statuses</option>
          <option>Completed</option>
          <option>No Answer</option>
        </select>
        <select className="bg-slate-50 border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500">
          <option>All durations</option>
          <option>&gt; 5 min</option>
          <option>&lt; 5 min</option>
        </select>
        <button className="bg-slate-50 border border-slate-200 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-sm font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Cards List */}
      <div className="flex flex-col gap-3">
        {calls.map((call, idx) => {
          const isCompleted = call.call_status === 'completed';
          const isOutbound = (call.call_direction || '').toLowerCase() === 'outbound';
          const badgeColor = isCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-rose-200 bg-rose-50 text-rose-600';

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={call.id || idx}
              onClick={() => onViewDetails && onViewDetails(call.id)}
              className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center gap-4 text-sm text-slate-600 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Phone size={16} className="text-indigo-500" />
              </div>

              {/* Info Column */}
              <div className="flex flex-col flex-1 gap-1">
                <div className="flex items-center gap-3">
                  <span className={`text-[0.6rem] uppercase font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${isOutbound ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                    {isOutbound ? <ArrowUpRight size={10} strokeWidth={3} /> : <ArrowDownLeft size={10} strokeWidth={3} />}
                    {isOutbound ? 'Outgoing' : 'Inbound'}
                  </span>
                  <span className="text-slate-800 font-bold tracking-wide text-[15px]">
                    {call.from_number || '+Unknown'} <span className="text-slate-400 mx-1 font-normal">→</span> {call.to_number || '+Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                  <span>{formatDate(call.time_of_call)}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono bg-slate-100 px-1.5 rounded">{formatDuration(call.call_duration)}</span>
                  <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-bold text-[0.65rem] uppercase tracking-wider ml-1">
                    {call.call_type || 'Test-Call'}
                  </span>
                </div>
              </div>

              {/* Right Column */}
              <div className="flex flex-col items-end gap-2 ml-auto">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md text-[0.7rem] text-slate-500 font-bold font-mono">
                  ID: #{call.id}
                  <Copy size={12} className="cursor-pointer hover:text-indigo-600 transition-colors" />
                </div>
                <div className={`px-2 py-0.5 rounded border text-[0.65rem] uppercase font-bold tracking-widest ${badgeColor}`}>
                  {call.call_status || 'unknown'}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function AICallingAgentPage() {
  const token = useSelector(state => state.auth.token)

  const [activeTab, setActiveTab] = useState('assistant')
  const [selectedCallId, setSelectedCallId] = useState(null)

  // Data states
  const [agentSettings, setAgentSettings] = useState(null)
  const [callConfig, setCallConfig] = useState(null)
  const [knowledgeBase, setKnowledgeBase] = useState([])
  const [integrations, setIntegrations] = useState([])
  const [postCallConfigs, setPostCallConfigs] = useState([])
  const [recentCalls, setRecentCalls] = useState([])

  // Loading states
  const [loadingMap, setLoadingMap] = useState({
    assistant: false, callconfig: false, knowledgebase: false,
    integrations: false, postcall: false, recentcalls: false
  })

  // Manual dialer state
  const [manualCall, setManualCall] = useState({ phone: '', name: '', jobDesc: '', resume: null })
  const [isCalling, setIsCalling] = useState(false)
  const [availableJobs, setAvailableJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [availableCandidates, setAvailableCandidates] = useState([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')

  useEffect(() => {
    if (!token) return
    const fetchJobs = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/jobs`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setAvailableJobs(data.jobs || [])
        }
      } catch (err) {
        console.error("Error fetching jobs for dialer:", err)
      }
    }
    fetchJobs()
  }, [token, API_BASE_URL])

  const headers = { Authorization: `Bearer ${token}` }

  const setLoading = (key, val) => setLoadingMap(m => ({ ...m, [key]: val }))

  const fetchAssistant = async () => {
    if (agentSettings) return
    setLoading('assistant', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/agent-settings`, { headers })
      const d = await r.json()
      if (r.ok) setAgentSettings(d.settings)
    } catch (e) { console.error(e) } finally { setLoading('assistant', false) }
  }

  const fetchCallConfig = async () => {
    if (callConfig) return
    setLoading('callconfig', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/call-config`, { headers })
      const d = await r.json()
      if (r.ok) setCallConfig(d.config)
    } catch (e) { console.error(e) } finally { setLoading('callconfig', false) }
  }

  const fetchKnowledgeBase = async () => {
    setLoading('knowledgebase', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/knowledge-base`, { headers })
      const d = await r.json()
      if (r.ok) setKnowledgeBase(d.files || [])
    } catch (e) { console.error(e) } finally { setLoading('knowledgebase', false) }
  }

  const fetchIntegrations = async () => {
    if (integrations.length) return
    setLoading('integrations', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/integrations`, { headers })
      const d = await r.json()
      if (r.ok) setIntegrations(d.integrations || [])
    } catch (e) { console.error(e) } finally { setLoading('integrations', false) }
  }

  const fetchPostCall = async () => {
    if (postCallConfigs.length) return
    setLoading('postcall', true)
    try {
      const r = await fetch(`${API_BASE_URL}/api/calls/post-call-config`, { headers })
      const d = await r.json()
      if (r.ok) setPostCallConfigs(d.post_call_configs || [])
    } catch (e) { console.error(e) } finally { setLoading('postcall', false) }
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
    } catch (e) {
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
      if (selectedJobId) formData.append('job_id', selectedJobId)
      if (selectedApplicationId) formData.append('application_id', selectedApplicationId)
      if (manualCall.resume) formData.append('resume', manualCall.resume)
      const r = await fetch(`${API_BASE_URL}/api/calls/initiate-manual`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      const d = await r.json()
      if (r.ok) { alert(d.message || 'Call initiated!'); setManualCall({ phone: '', name: '', jobDesc: '', resume: null }) }
      else alert('Failed: ' + (d.detail || 'Unknown error'))
    } catch (e) { alert('Error: ' + e.message) } finally { setIsCalling(false) }
  }

  const TABS = [
    { id: 'assistant', label: 'Assistant Details', icon: <Radio size={15} /> },
    { id: 'callconfig', label: 'Call Configuration', icon: <Cog size={15} /> },
    { id: 'knowledgebase', label: 'Knowledge Base', icon: <BookOpen size={15} /> },
    { id: 'integrations', label: 'Integrations', icon: <Plug size={15} /> },
    { id: 'postcall', label: 'Post-Call', icon: <MailCheck size={15} /> },
    { id: 'recentcalls', label: 'Recent Calls', icon: <Clock size={15} /> },
    { id: 'dialer', label: 'Manual Dialer', icon: <Phone size={15} /> },
  ]

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 pb-24 relative">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 relative z-10"
      >
        <div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-indigo-100 text-indigo-600 text-[0.7rem] font-bold tracking-widest uppercase mb-4 shadow-sm"
          >
            <Radio size={14} className="animate-pulse" /> Omni Dimension Integration
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-slate-800 to-indigo-900 tracking-tight mb-2"
          >
            AI Calling Agent
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-slate-600 mt-3 max-w-2xl text-sm leading-relaxed font-medium"
          >
            Live sync of your Omni Dimension AI Voice Agent — knowledge base, integrations, call configuration, post-call settings, and recent calls.
          </motion.p>
        </div>
      </motion.div>

      {/* Light card wrapping tabs + content */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="bg-white/80 backdrop-blur-xl rounded-[30px] border border-white/60 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10"
      >
        {/* Tab Bar */}
        <div className="flex items-center gap-2 px-4 pt-4 overflow-x-auto scrollbar-none border-b border-slate-200 bg-white/50 relative z-10 after:content-[''] after:w-4 after:shrink-0">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition-colors whitespace-nowrap outline-none flex-shrink-0 ${
                activeTab === id
                  ? 'text-indigo-700'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <span className="relative z-10 flex items-center gap-2">{icon} {label}</span>
              {activeTab === id && (
                <motion.div
                  layoutId="activeTabIndicatorLight"
                  className="absolute inset-0 bg-indigo-50 border-b-2 border-indigo-500 rounded-t-xl"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div className="p-6 md:p-8 min-h-[500px] relative z-10 bg-slate-50/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
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
                    console.log("Uploading file:", file.name);
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
                  <div className="mb-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2 mb-2">
                      <Phone size={20} className="text-indigo-500" /> Manual Dialer
                    </h3>
                    <p className="text-slate-500 text-sm font-medium">
                      Initiate an outbound AI call manually with a phone number and candidate context.
                    </p>
                  </div>
                  <div className="space-y-5 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 mb-2">Phone Number *</label>
                        <input
                          type="text" value={manualCall.phone}
                          onChange={e => setManualCall({ ...manualCall, phone: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold"
                          placeholder="+91 99999 00000"
                        />
                      </div>
                      <div>
                        <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 mb-2">Candidate Name</label>
                        <input
                          type="text" value={manualCall.name}
                          onChange={e => setManualCall({ ...manualCall, name: e.target.value.replace(/[0-9]/g, '') })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold"
                          placeholder="e.g. John Doe"
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">Job Description</label>
                        <div className="flex gap-2">
                           {availableJobs && availableJobs.length > 0 && (
                            <select
                              className="bg-indigo-50 border border-indigo-100 text-[0.7rem] font-bold text-indigo-700 rounded-lg px-2 py-1 outline-none focus:border-indigo-500 cursor-pointer"
                              onChange={async (e) => {
                                const jobId = e.target.value;
                                setSelectedJobId(jobId);
                                setSelectedApplicationId('');
                                if (!jobId) {
                                  setSelectedJob(null);
                                  setAvailableCandidates([]);
                                  return;
                                }
                                try {
                                  const res = await fetch(`${API_BASE_URL}/api/public/jobs/${jobId}`);
                                  if (res.ok) {
                                    const data = await res.json();
                                    const job = data.job;
                                    setSelectedJob(job);
                                    if (job) {
                                      const desc = `Role: ${job.title}\nExperience: ${job.experience || ''}\nSkills: ${job.skills || ''}\n\n${job.description || ''}`;
                                      setManualCall(prev => ({ ...prev, jobDesc: desc }));
                                    }
                                  }
                                  const appsRes = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/applications`, { headers });
                                  if (appsRes.ok) {
                                    const data = await appsRes.json();
                                    setAvailableCandidates(data.applications || []);
                                  } else {
                                    setAvailableCandidates([]);
                                  }
                                } catch (err) {
                                  console.error("Error fetching job description/applications:", err);
                                }
                              }}
                            >
                              <option value="">Auto-fill from saved Job...</option>
                              {availableJobs.map(job => (
                                <option key={job.job_id || job._id || job.id} value={job.job_id || job._id || job.id}>{job.title}</option>
                              ))}
                            </select>
                          )}
                          {availableCandidates && availableCandidates.length > 0 && (
                            <select
                              className="bg-teal-50 border border-teal-100 text-[0.7rem] font-bold text-teal-700 rounded-lg px-2 py-1 outline-none focus:border-teal-500 cursor-pointer"
                              onChange={(e) => {
                                const appObjId = e.target.value;
                                setSelectedApplicationId(appObjId);
                                if (!appObjId) return;
                                const candidate = availableCandidates.find(c => (c._id || c.id) === appObjId);
                                if (candidate) {
                                  const jobTitle = selectedJob ? selectedJob.title : '';
                                  const jobExp = selectedJob ? selectedJob.experience : '';
                                  const jobSkills = selectedJob ? selectedJob.skills : '';
                                  const jobDescription = selectedJob ? selectedJob.description : '';

                                  const desc = `Role: ${jobTitle}\nExperience: ${jobExp || ''}\nSkills: ${jobSkills || ''}\n\nCandidate Name: ${candidate.name || ''}\nCandidate Email: ${candidate.email || ''}\nCandidate Phone: ${candidate.phone || ''}\nCandidate Resume: ${candidate.resume_text || candidate.resume_url || ''}\n\nJob Description:\n${jobDescription || ''}`;

                                  setManualCall({
                                    phone: candidate.phone || '',
                                    name: candidate.name || '',
                                    jobDesc: desc,
                                    resume: null
                                  });
                                }
                                e.target.value = "";
                              }}
                            >
                              <option value="">Auto-fill Candidate...</option>
                              {availableCandidates.map(c => (
                                <option key={c._id || c.id} value={c._id || c.id}>{c.name} ({c.email})</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={manualCall.jobDesc}
                        onChange={e => setManualCall({ ...manualCall, jobDesc: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 h-28 resize-none transition-all font-medium"
                        placeholder="Paste job description or role requirements..."
                      />
                    </div>
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500">Resume (PDF/DOCX)</label>
                        {manualCall.resume && (
                          <button onClick={() => setManualCall({...manualCall, resume: null})} className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 transition-colors"><X size={12}/> Remove</button>
                        )}
                      </div>
                      {!manualCall.resume ? (
                        <input
                          type="file" accept=".pdf,.doc,.docx"
                          onChange={e => setManualCall({ ...manualCall, resume: e.target.files[0] })}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[0.7rem] file:font-bold file:uppercase file:tracking-wider file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        />
                      ) : (
                        <div className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 font-semibold flex items-center justify-between">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText size={16} className="shrink-0" /> 
                            <span className="truncate">{manualCall.resume.name}</span>
                          </div>
                          <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer font-bold px-2 py-1 hover:bg-indigo-100 rounded-md transition-colors">
                            Replace
                            <input
                              type="file" accept=".pdf,.doc,.docx"
                              onChange={e => setManualCall({ ...manualCall, resume: e.target.files[0] })}
                              className="hidden"
                            />
                          </label>
                        </div>
                      )}
                    </div>
                    <div className="pt-4 flex justify-end">
                      <button
                        onClick={handleManualCall}
                        disabled={isCalling || !manualCall.phone}
                        className="flex items-center gap-2 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-indigo-600/30 w-full justify-center sm:w-auto"
                      >
                        {isCalling ? <><Activity size={16} className="animate-spin" /> Calling...</> : <><Phone size={16} /> Start AI Call</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

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
