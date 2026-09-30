import React, { useState, useEffect, useRef } from 'react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { API_BASE_URL } from '../../apiConfig'
import {
  Radio, BookOpen, Clock, Volume2, Globe, Zap, FileText,
  Mic, MessageSquare, RefreshCw, ChevronDown, ChevronUp,
  AlertCircle, Upload, Trash2, CheckCircle2, Save, Info,
  Plus, CheckCircle, ExternalLink, Settings, Plug, Cog, MailCheck,
  Timer, User, Calendar, Play, Filter, XCircle
} from 'lucide-react'
import Button from '../../components/Button'
import IntegrationModal from './IntegrationModal'
import { 
  CalComIcon, CalendlyIcon, CustomApiIcon, SalesforceIcon, 
  GoogleCalendarIcon, GoogleSheetsIcon, SlackIcon, HubSpotIcon, 
  GenesysIcon, WhatsAppIcon 
} from '../../components/admin/BrandIcons'

function TogglePill({ value }) {
  return (
    <div className={`w-8 h-4 rounded-full flex items-center px-0.5 transition-colors ${value ? 'bg-indigo-500 justify-end' : 'bg-slate-300 justify-start'}`}>
      <div className="w-3 h-3 bg-white dark:bg-slate-800/60 rounded-full shadow-sm" />
    </div>
  )
}

function InfoRow({ label, value, mono = false }) {
  if (value === null || value === undefined || value === false || value === '') return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-xs font-semibold text-right text-slate-800 dark:text-slate-100 max-w-xs break-words ${mono ? 'font-mono text-[0.7rem]' : ''}`}>{String(value)}</span>
    </div>
  )
}

function SectionLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400">
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


function AssistantDetailsTab({ agentSettings, loading, token, omniApiKey, onRefresh }) {
  const defaultGreeting = "Hello {{candidate_name}}, this is Sarah, the AI Recruitment Assistant from HireIQ, calling on behalf of {{HIRE IQ}} regarding your application for the {{job_role}} position. I'd like to conduct a brief screening interview that will take about {{duration}} minutes. Would you like me to continue?"

  const [isDynamic, setIsDynamic] = useState(
    agentSettings?.is_welcome_message_dynamic !== undefined ? Boolean(agentSettings.is_welcome_message_dynamic) : true
  )
  const [isInterruptible, setIsInterruptible] = useState(
    agentSettings?.is_welcome_message_interruption !== undefined ? Boolean(agentSettings.is_welcome_message_interruption) : false
  )
  const [greetingText, setGreetingText] = useState(
    agentSettings?.welcome_message || agentSettings?.greeting_message || agentSettings?.first_ideal_message || defaultGreeting
  )
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')

  useEffect(() => {
    if (agentSettings?.welcome_message || agentSettings?.greeting_message) {
      setGreetingText(agentSettings.welcome_message || agentSettings.greeting_message)
    }
    if (agentSettings?.is_welcome_message_dynamic !== undefined) {
      setIsDynamic(Boolean(agentSettings.is_welcome_message_dynamic))
    }
    if (agentSettings?.is_welcome_message_interruption !== undefined) {
      setIsInterruptible(Boolean(agentSettings.is_welcome_message_interruption))
    }
  }, [agentSettings])

  const handleSaveAssistantDetails = async () => {
    setSaving(true)
    setSaveSuccess('')
    try {
      const configuredOmniApiKey = omniApiKey || sessionStorage.getItem('omniDimensionApiKey') || ''
      const res = await fetch(`${API_BASE_URL}/api/calls/agent-settings`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(configuredOmniApiKey ? { 'X-Omni-Dimension-API-Key': configuredOmniApiKey } : {})
        },
        body: JSON.stringify({
          welcome_message: greetingText,
          greeting_message: greetingText,
          is_dynamic: isDynamic,
          is_interruptible: isInterruptible
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Failed to save assistant settings')
      }

      setSaveSuccess('Welcome Message & Assistant Settings saved successfully!')
      setTimeout(() => setSaveSuccess(''), 3500)
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Settings Saved!',
          text: 'Welcome Message & Assistant Settings saved to Omni Dimension!',
          icon: 'success',
          timer: 2500,
          showConfirmButton: false
        })
      }
      if (onRefresh) onRefresh()
    } catch (err) {
      console.error(err)
      const msg = err.message || 'Failed to save assistant settings'
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error', msg, 'error')
      } else {
        alert(msg)
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SectionLoader />
  if (!agentSettings) return <EmptyState message="No agent settings found. Check your Omni Dimension API key." />

  return (
    <div className="space-y-6">
      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center text-emerald-600 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
          <p>{saveSuccess}</p>
        </div>
      )}

      {/* Assistant Settings Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Assistant Settings</h3>
            <Info size={14} className="text-slate-400 cursor-pointer hover:text-slate-600 transition-colors" />
          </div>

          <button
            type="button"
            onClick={handleSaveAssistantDetails}
            disabled={saving}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Languages */}
          <div className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:bg-slate-800/50/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between transition-all group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-100/70 text-indigo-600 group-hover:scale-105 transition-transform">
                <Globe size={16} />
              </div>
              <div>
                <div className="text-[0.7rem] font-bold text-slate-800 dark:text-slate-100 leading-tight">Languages</div>
                <div className="text-[0.68rem] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{agentSettings.language || 'English (India), Hindi'}</div>
              </div>
            </div>
            <Info size={13} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
          </div>

          {/* Voice (TTS) */}
          <div className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:bg-slate-800/50/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between transition-all group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-teal-100/70 text-teal-600 group-hover:scale-105 transition-transform">
                <Volume2 size={16} />
              </div>
              <div>
                <div className="text-[0.7rem] font-bold text-slate-800 dark:text-slate-100 leading-tight">Voice (TTS)</div>
                <div className="text-[0.68rem] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{agentSettings.tts_provider || 'Cartesia'} - {agentSettings.tts_voice_id || 'Riya'}</div>
              </div>
            </div>
            <Info size={13} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
          </div>

          {/* AI Model (LLM) */}
          <div className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:bg-slate-800/50/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between transition-all group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100/70 text-purple-600 group-hover:scale-105 transition-transform">
                <Zap size={16} />
              </div>
              <div>
                <div className="text-[0.7rem] font-bold text-slate-800 dark:text-slate-100 leading-tight">AI Model (LLM)</div>
                <div className="text-[0.68rem] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{agentSettings.llm_model || 'gpt-4o-mini'}</div>
              </div>
            </div>
            <Info size={13} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
          </div>

          {/* Transcription (STT) */}
          <div className="bg-slate-50 dark:bg-slate-900/50 hover:bg-slate-100 dark:bg-slate-800/50/80 border border-slate-200 dark:border-slate-700/80 rounded-xl p-3.5 flex items-center justify-between transition-all group cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-100/70 text-rose-600 group-hover:scale-105 transition-transform">
                <Mic size={16} />
              </div>
              <div>
                <div className="text-[0.7rem] font-bold text-slate-800 dark:text-slate-100 leading-tight">Transcription (STT)</div>
                <div className="text-[0.68rem] text-slate-500 dark:text-slate-400 font-medium mt-0.5">{agentSettings.asr_provider || 'Soniox'}</div>
              </div>
            </div>
            <Info size={13} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
          </div>
        </div>
      </div>

      {/* Welcome Message Section */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-extrabold text-sm tracking-tight">
            <MessageSquare size={16} className="text-emerald-500" /> Welcome Message
            <Info size={14} className="text-slate-400 cursor-pointer hover:text-slate-600 dark:text-slate-400 transition-colors" />
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 select-none cursor-pointer" onClick={() => setIsDynamic(!isDynamic)}>
              <span className={`text-xs font-bold ${isDynamic ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>Dynamic</span>
              <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${isDynamic ? "bg-teal-500 justify-end" : "bg-slate-300 justify-start"}`}>
                <div className="w-3.5 h-3.5 bg-white dark:bg-slate-800/60 rounded-full shadow-sm" />
              </div>
            </div>

            <div className="flex items-center gap-2 select-none cursor-pointer" onClick={() => setIsInterruptible(!isInterruptible)}>
              <span className={`text-xs font-bold ${isInterruptible ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>Interruptible</span>
              <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${isInterruptible ? "bg-indigo-600 justify-end" : "bg-slate-300 justify-start"}`}>
                <div className="w-3.5 h-3.5 bg-white dark:bg-slate-800/60 rounded-full shadow-sm" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <textarea
            rows={4}
            value={greetingText}
            onChange={e => setGreetingText(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/90 rounded-xl p-4 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white dark:bg-slate-800/60 transition-all leading-relaxed resize-none shadow-inner"
          />
          <div className="absolute bottom-3 right-3 text-[0.65rem] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800/50 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
            {greetingText.length}/600
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveAssistantDetails}
            disabled={saving}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-xs font-bold text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Welcome Message'}
          </button>
        </div>
      </div>

      {/* System Prompt Section */}
      {agentSettings.system_prompt && (
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-extrabold tracking-tight text-slate-800 dark:text-slate-100 uppercase">
              <FileText size={15} className="text-purple-600" /> System Prompt (Preview)
            </div>
          </div>
          <div className="p-6 text-[0.78rem] text-slate-600 dark:text-slate-400 leading-relaxed max-h-64 overflow-y-auto bg-white dark:bg-slate-800/60 font-mono border-t border-slate-100 dark:border-slate-800">
            {agentSettings.system_prompt}
          </div>
        </div>
      )}
    </div>
  )
}


function ModeSwitch({ isDynamic, onChange }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold select-none">
      <span className={!isDynamic ? "text-slate-800 dark:text-slate-100 font-bold" : "text-slate-400"}>Static</span>
      <button
        type="button"
        onClick={() => onChange(!isDynamic)}
        className={`w-9 h-4.5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
          isDynamic ? "bg-indigo-600 justify-end" : "bg-slate-300 justify-start"
        }`}
      >
        <div className="w-3.5 h-3.5 bg-white dark:bg-slate-800/60 rounded-full shadow-md" />
      </button>
      <span className={isDynamic ? "text-indigo-600 font-bold" : "text-slate-400"}>Dynamic</span>
    </div>
  )
}

function CyanToggleSwitch({ checked, onChange, label = "" }) {
  return (
    <div className="flex items-center gap-2.5 select-none cursor-pointer" onClick={() => onChange(!checked)}>
      {label && <span className={`text-xs font-bold ${checked ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`}>{label}</span>}
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
        checked ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/40" : "bg-slate-700/50 text-slate-400 border-slate-600"
      }`}>
        {checked ? "ON" : "OFF"}
      </span>
      <div className={`w-9 h-4.5 rounded-full p-0.5 transition-colors flex items-center border ${checked ? "bg-indigo-600 border-indigo-500 justify-end" : "bg-slate-600 border-slate-500 justify-start"
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

      const token = sessionStorage.getItem('token') || localStorage.getItem('token')
      const configuredOmniApiKey = omniApiKey || sessionStorage.getItem('omniDimensionApiKey') || ''
      const res = await fetch(`${API_BASE_URL}/api/calls/call-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,


          ...(configuredOmniApiKey ? { 'X-Omni-Dimension-API-Key': configuredOmniApiKey } : {}),
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
    <form onSubmit={handleSaveConfig} className="space-y-5 w-full text-slate-800 dark:text-slate-100">
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
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="font-extrabold text-xl text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Cog size={22} className="text-indigo-600" /> Call Configuration
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Manage live agent silence rules, end-call conditions, ambient audio, and voicemail.</p>
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
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div 
          onClick={() => setOpenSilence(!openSilence)}
          className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900/50/80 border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none hover:bg-slate-100 dark:bg-slate-800/50/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Timer size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Silence Handling</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">What happens when a caller goes quiet or stops responding</p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
            {openSilence ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openSilence && (
          <div className="p-6 space-y-6 bg-white dark:bg-slate-800/60">
            {/* User idle threshold */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">User idle threshold</label>
                <p className="text-[0.72rem] text-slate-500 dark:text-slate-400">How long to wait before the agent nudges a silent caller.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={formData.user_idle_threshold_sec}
                  onChange={e => handleChange('user_idle_threshold_sec', parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">sec</span>
              </div>
            </div>

            {/* Idle messages heading */}
            <div>
              <div className="text-xs font-bold tracking-wide uppercase text-slate-500 dark:text-slate-400 mb-4">Idle messages (what the agent says)</div>
              
              {/* First Idle Message */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">First idle message</span>
                  <ModeSwitch 
                    isDynamic={formData.first_idle_dynamic} 
                    onChange={val => handleChange('first_idle_dynamic', val)} 
                  />
                </div>
                <p className="text-[0.7rem] text-slate-500 dark:text-slate-400">Generated live in the ongoing language if the caller is silent for {formData.user_idle_threshold_sec} seconds.</p>
                {!formData.first_idle_dynamic && (
                  <input
                    type="text"
                    value={formData.first_ideal_message}
                    onChange={e => handleChange('first_ideal_message', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {/* Second Idle Message */}
              <div className="space-y-2 mb-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">Second idle message</span>
                  <ModeSwitch 
                    isDynamic={formData.second_idle_dynamic} 
                    onChange={val => handleChange('second_idle_dynamic', val)} 
                  />
                </div>
                <p className="text-[0.7rem] text-slate-500 dark:text-slate-400">Generated live in the ongoing language if the caller stays silent another {formData.user_idle_threshold_sec} seconds.</p>
                {!formData.second_idle_dynamic && (
                  <input
                    type="text"
                    value={formData.second_ideal_message}
                    onChange={e => handleChange('second_ideal_message', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
                  />
                )}
              </div>

              {/* Last Idle Message */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 block">Last idle message</span>
                <input
                  type="text"
                  value={formData.last_ideal_message}
                  onChange={e => handleChange('last_ideal_message', e.target.value)}
                  placeholder="I'll leave you for now. Have a nice day!"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                />
                <p className="text-[0.7rem] text-slate-500 dark:text-slate-400">Spoken after a final {formData.user_idle_threshold_sec} seconds of silence, then the call hangs up automatically.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: End Call Rules */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div 
          onClick={() => setOpenEndCall(!openEndCall)}
          className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900/50/80 border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none hover:bg-slate-100 dark:bg-slate-800/50/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-100 text-rose-600">
              <XCircle size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">End Call Rules</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Set conditions for when the assistant should hang up</p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
            {openEndCall ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openEndCall && (
          <div className="p-6 space-y-6 bg-white dark:bg-slate-800/60">
            {/* Max Call Duration */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5 flex items-center gap-1">
                  Max Call Duration (sec) <span className="text-slate-400 text-[0.65rem]">ⓘ</span>
                </label>
                <p className="text-[0.72rem] text-slate-500 dark:text-slate-400">The maximum duration in seconds before the call is automatically ended.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  value={formData.max_call_duration_in_sec}
                  onChange={e => handleChange('max_call_duration_in_sec', parseInt(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono text-slate-800 dark:text-slate-100 text-right focus:outline-none focus:border-indigo-500"
                />
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Second(s)</span>
              </div>
            </div>

            {/* Enable Automatic Call Ending */}
            <div className="flex items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">Enable Automatic Call Ending</label>
                <p className="text-[0.72rem] text-slate-500 dark:text-slate-400">Allow your agent to automatically end calls based on specific conditions</p>
              </div>
              <CyanToggleSwitch 
                checked={formData.is_end_call_enabled} 
                onChange={val => handleChange('is_end_call_enabled', val)} 
                label={formData.is_end_call_enabled ? "Enabled" : "Disabled"}
              />
            </div>

            {/* End Call Settings */}
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">End Call Settings</div>
              
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">End Call Condition *</label>
                <input
                  type="text"
                  value={formData.end_call_condition}
                  onChange={e => handleChange('end_call_condition', e.target.value)}
                  placeholder="End the call when the user says goodbye, thank you, or indicates they are done with the conversation"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-1">End Call Goodbye Message</label>
                <input
                  type="text"
                  value={formData.end_call_message}
                  onChange={e => handleChange('end_call_message', e.target.value)}
                  placeholder="Thank you for speaking with me today. Goodbye!"
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Response & Ambient Noise */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm">
        <div 
          onClick={() => setOpenResponse(!openResponse)}
          className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-900/50/80 border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none hover:bg-slate-100 dark:bg-slate-800/50/60 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-100 text-amber-600">
              <Volume2 size={18} />
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100">Response Behavior & Ambient Audio</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">Speech speed, ring tones, ambient noise, and voicemail detection</p>
            </div>
          </div>
          <button type="button" className="text-slate-400 hover:text-slate-600 dark:text-slate-400">
            {openResponse ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {openResponse && (
          <div className="p-6 space-y-6 bg-white dark:bg-slate-800/60">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">Speech Speed ({formData.speech_speed}x)</label>
                <input
                  type="range" min="0.7" max="1.3" step="0.05"
                  value={formData.speech_speed}
                  onChange={e => handleChange('speech_speed', parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-100 mb-0.5">Initial Ringing Sound</label>
                  <p className="text-[0.72rem] text-slate-500 dark:text-slate-400">Play ring tone before agent speaks first word</p>
                </div>
                <CyanToggleSwitch 
                  checked={formData.initial_ringing_sound_enabled} 
                  onChange={val => handleChange('initial_ringing_sound_enabled', val)} 
                />
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">Background Ambient Noise</label>
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
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="office_ambiance">Office Ambiance</option>
                      <option value="call_center">Call Center Noise</option>
                      <option value="cafe_sound">Cafe / Soft Coffee Shop</option>
                      <option value="white_noise">Subtle White Noise</option>
                    </select>
                    <div>
                      <span className="text-[0.7rem] text-slate-500 dark:text-slate-400 font-bold block mb-1">Volume ({Math.round(formData.background_audio_volume * 100)}%)</span>
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
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">Voicemail Detection</label>
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
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-indigo-500 font-medium"
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
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BookOpen size={20} className="text-indigo-500" /> Knowledge Base
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Manage documents that give your AI specialized knowledge.</p>
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
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm">
          <BookOpen size={32} className="opacity-30 text-indigo-400" />
          <span className="text-sm font-semibold">No knowledge base files uploaded yet.</span>
          <p className="text-xs text-slate-400 text-center max-w-sm">Upload PDFs, DOCX, or text files to give your AI agent specialized knowledge.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {files.map((file, i) => (
            <div key={i} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex items-start justify-between gap-4 group shadow-sm hover:shadow-md hover:border-indigo-200 transition-all">
              <div className="flex items-start gap-4 min-w-0">
                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-500">
                  <FileText size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{file.name || file.file_name || 'Untitled'}</div>
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
  { id: 'cal_com', name: 'Cal.com', category: 'Calendar & CRM', tag: 'During Call', desc: 'Sync your Cal.com calendar to allow voice assistants to schedule meetings on your behalf.', IconComponent: CalComIcon },
  { id: 'calendly', name: 'Calendly', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Calendly account to check availability and schedule appointments through your voice assistants.', IconComponent: CalendlyIcon },
  { id: 'custom_api', name: 'Custom API', category: 'Custom & Tools', tag: 'During Call', desc: 'Connect to any custom API endpoint to extend your assistant\'s capabilities with external data and services.', IconComponent: CustomApiIcon },
  { id: 'salesforce', name: 'Salesforce', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your Salesforce CRM to access customer data, manage leads, and update records through your voice assistants.', IconComponent: SalesforceIcon },
  { id: 'google_calendar', name: 'Google Calendar', category: 'Calendar & CRM', tag: 'During Call', desc: 'Connect your Google Calendar to check availability and schedule appointments through your voice assistants.', IconComponent: GoogleCalendarIcon },
  { id: 'google_sheets_during', name: 'Google Sheets', category: 'Data & Sheets', tag: 'During Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data during calls.', IconComponent: GoogleSheetsIcon },
  { id: 'google_sheets_post', name: 'Google Sheets', category: 'Data & Sheets', tag: 'Post Call', desc: 'Connect your Google Sheets to read, write, and manage spreadsheet data through your voice assistants.', IconComponent: GoogleSheetsIcon },
  { id: 'slack', name: 'Slack', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Slack workspace to receive notifications and updates about your voice assistants.', IconComponent: SlackIcon },
  { id: 'hubspot', name: 'HubSpot', category: 'Calendar & CRM', tag: 'Post Call', desc: 'Connect your HubSpot platform to enable voice assistants to manage contacts, automate marketing campaigns, and handle customer service tasks.', IconComponent: HubSpotIcon },
  { id: 'genesys', name: 'Genesys', category: 'Messaging', tag: 'Post Call', desc: 'Connect your Genesys Cloud contact center to enhance customer experience with AI-powered routing, real-time analytics, and seamless voice AI assistant integration.', IconComponent: GenesysIcon },
  { id: 'whatsapp', name: 'WhatsApp Cloud', category: 'Messaging', tag: 'During Call', desc: 'Send WhatsApp messages during calls using Meta Cloud API templates via your connected Cloud WhatsApp number.', IconComponent: WhatsAppIcon },
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

      const token = sessionStorage.getItem('token') || localStorage.getItem('token')
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 tracking-tight">
            <Plug size={20} className="text-indigo-600" /> Omni Dimension Integrations
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Live sync your Omni Dimension AI Voice Agent with CRM, calendar scheduling, webhooks, and messaging tools.</p>
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
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-500" /> Active Connected Integrations ({integrations.length})
            </h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((int) => (
              <div key={int.id} className="bg-slate-50 dark:bg-slate-900/50/70 border border-slate-200 dark:border-slate-700 rounded-xl p-4 relative group hover:border-indigo-300 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-600">
                    <Plug size={16} />
                  </div>
                  <span className="text-[0.65rem] font-bold px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 uppercase tracking-wider">
                    Connected
                  </span>
                </div>
                <div className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight pr-8">{int.name}</div>
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
                  : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:text-slate-900 dark:text-white hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
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
              <div key={idx} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden flex flex-col group hover:border-indigo-300 hover:shadow-md transition-all">
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <int.IconComponent className="w-7 h-7" />
                      <span className="font-bold text-slate-800 dark:text-slate-100 text-sm tracking-wide">{int.name}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[0.6rem] font-bold tracking-wider uppercase border flex items-center gap-1 shrink-0 ${
                      int.tag === 'During Call' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    }`}>
                      {int.tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                    {int.desc}
                  </p>
                </div>
                <div className="border-t border-slate-100 dark:border-slate-800 p-3.5 flex justify-start bg-slate-50 dark:bg-slate-900/50/50">
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


function PostCallTab({ configs, loading, onRefresh }) {
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState('')
  const [saveError, setSaveError] = useState('')

  // State initialized from existing config or defaults matching Omni Dimension schema
  const initialConfig = (configs && configs.length > 0 && typeof configs[0] === 'object') ? configs[0] : {}

  const [deliveryMethod, setDeliveryMethod] = useState(() => initialConfig.delivery_method || 'webhook')
  const [destination, setDestination] = useState(() => initialConfig.destination || initialConfig.webhook_url || '')
  
  const [selectedStatuses, setSelectedStatuses] = useState(() => {
    const list = initialConfig.trigger_call_statuses || initialConfig.trigger_statuses || initialConfig.call_statuses
    return Array.isArray(list) && list.length > 0 ? list.map(s => String(s).toLowerCase()) : ['completed']
  })

  const [includes, setIncludes] = useState(() => ({
    include_summary: initialConfig.include_summary ?? true,
    include_full_conversation: initialConfig.include_full_conversation ?? true,
    include_sentiment: initialConfig.include_sentiment ?? true,
    include_extracted_info: initialConfig.include_extracted_info ?? true,
  }))

  const [variables, setVariables] = useState(() => {
    const vars = initialConfig.extracted_variables || initialConfig.variables
    if (Array.isArray(vars) && vars.length > 0) return vars
    return [
      { key: 'candidate_name', description: 'Full name of the candidate interviewed' },
      { key: 'technical_score', description: 'Overall technical score evaluated out of 10' },
      { key: 'key_strengths', description: 'Primary candidate strengths demonstrated during call' },
      { key: 'final_recommendation', description: 'Hire / Hold / Reject recommendation with reasoning' },
    ]
  })

  useEffect(() => {
    if (configs && configs.length > 0 && typeof configs[0] === 'object') {
      const c = configs[0]
      if (c.delivery_method) setDeliveryMethod(c.delivery_method)
      if (c.destination || c.webhook_url) setDestination(c.destination || c.webhook_url)
      const list = c.trigger_call_statuses || c.trigger_statuses || c.call_statuses
      if (Array.isArray(list) && list.length > 0) setSelectedStatuses(list.map(s => String(s).toLowerCase()))
      setIncludes({
        include_summary: c.include_summary ?? true,
        include_full_conversation: c.include_full_conversation ?? true,
        include_sentiment: c.include_sentiment ?? true,
        include_extracted_info: c.include_extracted_info ?? true,
      })
      const vars = c.extracted_variables || c.variables
      if (Array.isArray(vars) && vars.length > 0) setVariables(vars)
    }
  }, [configs])

  const toggleStatus = (status) => {
    const s = status.toLowerCase()
    if (selectedStatuses.includes(s)) {
      if (selectedStatuses.length > 1) {
        setSelectedStatuses(selectedStatuses.filter(item => item !== s))
      }
    } else {
      setSelectedStatuses([...selectedStatuses, s])
    }
  }

  const toggleInclude = (field) => {
    setIncludes(prev => ({ ...prev, [field]: !prev[field] }))
  }

  const handleAddVariable = () => {
    setVariables([...variables, { key: '', description: '' }])
  }

  const handleVariableChange = (index, field, value) => {
    const updated = [...variables]
    updated[index][field] = value
    setVariables(updated)
  }

  const handleRemoveVariable = (index) => {
    setVariables(variables.filter((_, i) => i !== index))
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    setSaveSuccess('')
    setSaveError('')
    try {
      const token = sessionStorage.getItem('token')
      const payload = {
        delivery_method: deliveryMethod,
        destination: destination,
        webhook_url: destination,
        trigger_call_statuses: selectedStatuses,
        ...includes,
        extracted_variables: variables.filter(v => v.key.trim() !== '')
      }

      const res = await fetch(`${API_BASE_URL}/api/calls/post-call-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,

        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok) {
        setSaveSuccess('Post-Call Delivery Settings saved to Omni Dimension!')
        if (onRefresh) onRefresh()
        setTimeout(() => setSaveSuccess(''), 3000)
      } else {
        setSaveError(data.detail || 'Failed to save post-call configuration')
      }
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SectionLoader />

  const ALL_STATUSES = [
    { id: 'completed', label: 'Completed' },
    { id: 'voicemail_detected', label: 'Voicemail Detected' },
    { id: 'no_answer', label: 'No Answer' },
    { id: 'busy', label: 'Busy' },
    { id: 'failed', label: 'Failed' },
  ]

  const OUTPUT_OPTIONS = [
    { field: 'include_summary', label: 'Call Summary', description: 'A brief overview of the conversation including key points and outcomes' },
    { field: 'include_full_conversation', label: 'Full Conversation', description: 'Complete transcript of the entire conversation with timestamps' },
    { field: 'include_sentiment', label: 'Sentiment Analysis', description: 'Analysis of customer mood and emotional responses throughout the call' },
    { field: 'include_extracted_info', label: 'Extracted Information', description: 'Key data points extracted from the conversation' },
  ]

  return (
    <div className="space-y-6 w-full text-slate-800 dark:text-slate-100">
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 text-sm font-semibold flex items-center justify-between animate-in fade-in">
          <span>{saveSuccess}</span>
          <CheckCircle2 size={18} />
        </div>
      )}
      {saveError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm font-semibold flex items-center justify-between animate-in fade-in">
          <span>{saveError}</span>
          <XCircle size={18} />
        </div>
      )}

      {/* Container */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm text-slate-800 dark:text-slate-100">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/80">
          <div>
            <h3 className="font-extrabold text-lg text-slate-800 dark:text-slate-100 tracking-wide">Post-Call Delivery Settings</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Configure automated webhooks, data summaries, and AI variable extraction delivered upon call completion.</p>
          </div>
          <button
            onClick={handleSaveConfig}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <MailCheck size={16} />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        <div className="p-6 space-y-8 bg-white dark:bg-slate-800/60">
          {/* Delivery Method & Target */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Delivery Method</label>
              <select
                value={deliveryMethod}
                onChange={e => setDeliveryMethod(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="webhook">Webhook (HTTP POST)</option>
                <option value="email">Email Notification</option>
                <option value="slack">Slack Channel Webhook</option>
                <option value="crm">CRM Integration Sync</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {deliveryMethod === 'email' ? 'Destination Email Address *' : 'Webhook Destination URL *'}
              </label>
              <input
                type={deliveryMethod === 'email' ? 'email' : 'url'}
                value={destination}
                onChange={e => setDestination(e.target.value)}
                placeholder={deliveryMethod === 'email' ? 'recruiter@company.com' : 'https://api.yourdomain.com/webhooks/call-ended'}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-2.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            </div>
          </div>

          {/* Trigger based on Call Status */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Trigger based on Call Status
            </label>
            <div className="flex flex-wrap gap-2.5">
              {ALL_STATUSES.map(({ id, label }) => {
                const isSelected = selectedStatuses.includes(id)
                return (
                  <button
                    type="button"
                    key={id}
                    onClick={() => toggleStatus(id)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:border-slate-300 hover:text-indigo-600'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Including Options */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
              Including (Data Payload Outputs)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {OUTPUT_OPTIONS.map(({ field, label, description }) => {
                const checked = includes[field]
                return (
                  <div
                    key={field}
                    onClick={() => toggleInclude(field)}
                    className={`rounded-xl border p-4 flex items-start gap-3.5 transition-all cursor-pointer ${
                      checked
                        ? 'border-indigo-400 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/60 hover:border-slate-300'
                    }`}
                  >
                    <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:bg-slate-800/60'
                    }`}>
                      {checked && <CheckCircle2 size={12} strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">{label}</div>
                      <div className="text-[0.72rem] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{description}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Extracted Variables */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Extracted Variables
                </label>
                <p className="text-[0.72rem] text-slate-500 dark:text-slate-400 mt-0.5">Specify custom variables Omni Dimension extracts from the conversation transcript.</p>
              </div>
              <button
                type="button"
                onClick={handleAddVariable}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-600 transition-colors cursor-pointer"
              >
                <Plus size={14} /> Add Variable
              </button>
            </div>

            <div className="space-y-3 mt-3">
              {variables.map((variable, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-3.5 group hover:border-slate-300 transition-all">
                  <div className="md:col-span-4">
                    <input
                      type="text"
                      value={variable.key}
                      onChange={e => handleVariableChange(idx, 'key', e.target.value)}
                      placeholder="variable_name"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-800 dark:text-slate-100 font-mono placeholder-slate-400 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-7">
                    <input
                      type="text"
                      value={variable.description}
                      onChange={e => handleVariableChange(idx, 'description', e.target.value)}
                      placeholder="Description of what to extract..."
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveVariable(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove variable"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}



export {
  TogglePill,
  InfoRow,
  SectionLoader,
  EmptyState,
  ModeSwitch,
  CyanToggleSwitch,
  AssistantDetailsTab,
  CallConfigTab,
  KnowledgeBaseTab,
  IntegrationsTab,
  PostCallTab
}
