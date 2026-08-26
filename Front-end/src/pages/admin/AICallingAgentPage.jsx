import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { API_BASE_URL } from '../../apiConfig'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Radio, PhoneCall, Settings2, Activity, CheckCircle2, XCircle, Phone,
  BookOpen, Plug, Cog, MailCheck, Clock, Volume2, Globe, Zap, FileText,
  Mic, MessageSquare, RefreshCw, ChevronDown, ChevronUp, Timer,
  AlertCircle, User, Calendar, TrendingUp, Play, Plus, Trash2, Copy,
  ArrowUpRight, ArrowDownLeft, Upload, Search, Filter, Users, Settings, Save,
  CheckCircle, Eye, Brain, X, ExternalLink, Info, Download, FileSpreadsheet
} from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import CallDetailsModal from './CallDetailsModal'
import IntegrationModal from './IntegrationModal'

import ConversationalFlowPage from './ConversationalFlowPage'
import { 
  CalComIcon, CalendlyIcon, CustomApiIcon, SalesforceIcon, 
  GoogleCalendarIcon, GoogleSheetsIcon, SlackIcon, HubSpotIcon, 
  GenesysIcon, WhatsAppIcon 
} from '../../components/admin/BrandIcons'
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

// ─── Tab Components ─────────────────────────────────────────────────────────────

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
      <div className={`w-9 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
        checked ? "bg-indigo-600 justify-end" : "bg-slate-300 justify-start"
      }`}>
        <div className="w-3.5 h-3.5 bg-white dark:bg-slate-800/60 rounded-full shadow-md" />
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
    <form onSubmit={handleSaveConfig} className="space-y-5 max-w-5xl mx-auto text-slate-800 dark:text-slate-100">
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
    <div className="space-y-6 max-w-4xl mx-auto text-slate-800 dark:text-slate-100">
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
      <span className="text-[0.6rem] text-slate-500 dark:text-slate-400 w-20 shrink-0 font-bold uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color] || colorMap.indigo} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.65rem] text-slate-700 dark:text-slate-200 font-bold font-mono w-8 text-right">{value != null ? parseFloat(value).toFixed(1) : '—'}</span>
    </div>
  )
}

function getAICallLinkId(call) {
  const callId = call?.id || call?.call_id || (call?.call_request_id?.id) || ''
  if (!callId) return null

  if (String(callId).startsWith('ai_call_')) {
    return String(callId)
  }
  return `ai_call_omni_${callId}`
}

function formatDuration(str) {
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

function formatDate(dateString) {
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

function RecentCallsTab({ calls, loading, onViewDetails }) {
  if (loading) return <SectionLoader />
  if (!calls || calls.length === 0) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-3xl h-[400px] gap-5 text-slate-400 shadow-sm">
          <div className="p-4 bg-indigo-50 rounded-full border border-indigo-100 text-indigo-400">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48 0a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400 tracking-wide">Previous calls will appear here</span>
        </div>
      </div>
    )
  }



  const [yesNoFilter, setYesNoFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [directionFilter, setDirectionFilter] = useState('all')
  const [durationFilter, setDurationFilter] = useState('all')

  const displayCalls = calls.filter(call => {
    const st = (call.call_status || call.status || '').toLowerCase();
    if (st === 'initiated') return false;

    // Status filter matching dropdown options
    if (statusFilter !== 'all') {
      if (statusFilter === 'answered' && !['completed', 'answered', 'ended', 'success'].includes(st)) return false;
      if (statusFilter === 'missed' && !['no-answer', 'missed', 'unanswered', 'no_answer'].includes(st)) return false;
      if (statusFilter === 'voicemail' && !['voicemail', 'machine', 'answering_machine'].includes(st)) return false;
      if (statusFilter === 'busy' && !['busy', 'user_busy'].includes(st)) return false;
      if (statusFilter === 'failed' && !['failed', 'error', 'rejected'].includes(st)) return false;
    }

    // Direction filter
    const dirStr = (call.call_direction || call.call_type || call.direction || 'outbound').toLowerCase();
    if (directionFilter === 'inbound' && !dirStr.includes('inbound')) return false;
    if (directionFilter === 'outbound' && (!dirStr.includes('outbound') && !dirStr.includes('outgoing'))) return false;

    // Duration filter
    if (durationFilter !== 'all') {
      const durSec = typeof call.call_duration === 'number' 
        ? call.call_duration 
        : parseInt(call.call_duration || '0', 10);
      if (durationFilter === '>5' && durSec <= 300) return false;
      if (durationFilter === '<5' && durSec > 300) return false;
    }

    // yesNoFilter: 'all' | 'yes' | 'no'
    if (yesNoFilter === 'all') return true;

    // Determine if a call has any recording/transcript/post-call artifacts
    const hasRecording = !!(
      call.recording_url || call.recordings || call.has_recording || call.recording
    );
    const hasTranscript = !!(
      call.transcript || call.transcriptions || call.has_transcript || call.stt_transcript
    );
    const hasPostCall = hasRecording || hasTranscript || !!call.post_call

    if (yesNoFilter === 'yes') return hasPostCall;
    if (yesNoFilter === 'no') return !hasPostCall;

    return true;
  });

  return (
    <div className="max-w-[1200px] mx-auto min-h-[500px]">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-6 bg-white dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex-wrap">
        <span className="text-slate-800 dark:text-slate-100 font-extrabold mr-2 ml-2">Recent Calls ({displayCalls.length})</span>
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider ml-auto mr-2">Filters <AlertCircle size={14} className="inline opacity-50" /></span>
        <select 
          value={directionFilter}
          onChange={e => setDirectionFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All directions</option>
          <option value="inbound">Incoming</option>
          <option value="outbound">Outgoing</option>
        </select>
        <select 
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="answered">Answered</option>
          <option value="missed">Missed</option>
          <option value="voicemail">Voicemail</option>
          <option value="busy">Busy</option>
          <option value="failed">Failed</option>
        </select>
        <select 
          value={durationFilter}
          onChange={e => setDurationFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All durations</option>
          <option value=">5">&gt; 5 min</option>
          <option value="<5">&lt; 5 min</option>
        </select>
        <select
          value={yesNoFilter}
          onChange={e => setYesNoFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        <button className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-sm font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Cards List */}
      <div className="flex flex-col gap-3">
        {displayCalls.length === 0 ? (
          <EmptyState message="No completed or logged calls found." />
        ) : (
          displayCalls.map((call, idx) => {
            const st = (call.call_status || call.status || 'completed').toLowerCase();
            const isCompleted = st === 'completed' || st === 'answered' || st === 'ended';
            const dirStr = (call.call_direction || call.call_type || call.direction || 'outbound').toLowerCase();
            const isOutbound = dirStr.includes('outbound') || dirStr.includes('outgoing');
            
            let badgeColor = 'border-emerald-200 bg-emerald-50 text-emerald-600';
            let badgeLabel = call.call_status || 'Answered';
            if (st === 'missed' || st === 'no-answer') {
              badgeColor = 'border-amber-200 bg-amber-50 text-amber-600';
              badgeLabel = 'Missed';
            } else if (st === 'voicemail') {
              badgeColor = 'border-purple-200 bg-purple-50 text-purple-600';
              badgeLabel = 'Voicemail';
            } else if (st === 'busy') {
              badgeColor = 'border-orange-200 bg-orange-50 text-orange-600';
              badgeLabel = 'Busy';
            } else if (st === 'failed') {
              badgeColor = 'border-rose-200 bg-rose-50 text-rose-600';
              badgeLabel = 'Failed';
            } else if (isCompleted) {
              badgeColor = 'border-emerald-200 bg-emerald-50 text-emerald-600';
              badgeLabel = 'Answered';
            }

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={call.id || idx}
              onClick={() => onViewDetails && onViewDetails(call.id)}
              className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Phone size={16} className="text-indigo-500" />
              </div>

              {/* Info Column */}
              <div className="flex flex-col flex-1 gap-1">
                <div className="flex items-center gap-3">
                  <span className={`text-[0.6rem] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${isOutbound ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                    {isOutbound ? <ArrowUpRight size={10} strokeWidth={3} /> : <ArrowDownLeft size={10} strokeWidth={3} />}
                    {isOutbound ? 'Outgoing' : 'Incoming'}
                  </span>
                  <span className="text-slate-800 dark:text-slate-100 font-bold tracking-wide text-[15px] flex items-center gap-2">
                    {call.candidate_id && <span className="bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded text-[0.65rem] border border-slate-200 dark:border-slate-700">{call.candidate_id}</span>}
                    {call.candidate_name || call.user_name || call.name || call.from_number || '+Unknown'} <span className="text-slate-400 mx-1 font-normal">→</span> {call.to_number || '+Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <span>{formatDate(call.time_of_call)}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/50 px-1.5 rounded text-slate-600 dark:text-slate-400">{formatDuration(call.call_duration)}</span>
                </div>
              </div>

                {/* Right Column */}
                <div className="flex flex-col items-end gap-2 ml-auto">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md text-[0.7rem] text-slate-500 dark:text-slate-400 font-bold font-mono">
                    ID: #{call.id}
                    <Copy size={12} className="cursor-pointer hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              </motion.div>
            )
          }))}
      </div >
    </div >
  )
}

function ApprovalCallsTab({ calls, loading, onViewDetails, onDecision, actionLoadingMap }) {
  const [searchFilter, setSearchFilter] = useState('')
  const [filterTab, setFilterTab] = useState('pending') // 'pending', 'approved', 'rejected', 'all'

  const completedCalls = calls.filter(call => {
    const st = (call.call_status || call.status || '').toLowerCase()
    return ['completed', 'answered', 'ended', 'success'].includes(st)
  })

  const pendingCount = completedCalls.filter(c => !c.decision || c.decision === 'pending' || c.decision === 'none').length
  const approvedCount = completedCalls.filter(c => c.decision === 'selected' || c.decision === 'approved').length
  const rejectedCount = completedCalls.filter(c => c.decision === 'rejected').length

  const filteredCalls = completedCalls.filter(call => {
    const dec = (call.decision || 'pending').toLowerCase()
    if (filterTab === 'pending' && dec !== 'pending' && dec !== 'none' && dec !== '') return false
    if (filterTab === 'approved' && dec !== 'selected' && dec !== 'approved') return false
    if (filterTab === 'rejected' && dec !== 'rejected') return false

    const name = (call.candidate_name || call.user_name || call.name || call.to_number || '').toString().toLowerCase()
    const id = (call.id || call.call_id || '').toString().toLowerCase()
    return name.includes(searchFilter.toLowerCase()) || id.includes(searchFilter.toLowerCase())
  })

  return (
    <div className="max-w-[1200px] mx-auto min-h-[500px]">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div>
            <p className="text-slate-900 dark:text-white font-extrabold text-lg">Approval Queue</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Review completed AI calls and approve or reject candidates for the Hire IQ interview stage.</p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search by candidate or call ID"
              className="min-w-[220px] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="text-slate-500 dark:text-slate-400 hover:text-indigo-700 text-sm font-bold"
              >Clear</button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'pending'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            Pending Approval ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('approved')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'approved'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('rejected')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'rejected'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            All Calls ({completedCalls.length})
          </button>
        </div>
      </div>

      {loading ? (
        <SectionLoader />
      ) : filteredCalls.length === 0 ? (
        <EmptyState message={`No ${filterTab === 'all' ? 'completed' : filterTab} candidates found.`} />
      ) : (
        <div className="grid gap-4">
          {filteredCalls.map((call, idx) => {
            const status = (call.call_status || call.status || 'completed').toLowerCase()
            const isCompleted = ['completed', 'answered', 'ended', 'success'].includes(status)
            const linkId = getAICallLinkId(call)
            const loadingAction = !!actionLoadingMap[linkId]
            const currentDecision = (call.decision || '').toLowerCase()
            const isApproved = currentDecision === 'selected' || currentDecision === 'approved'
            const isRejected = currentDecision === 'rejected'

            return (
              <div key={call.id || idx} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">Candidate</span>
                      <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold border border-indigo-100">{isCompleted ? 'Completed' : 'Pending'}</span>
                      {isApproved && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold border border-emerald-200">
                          ✓ APPROVED
                        </span>
                      )}
                      {isRejected && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-extrabold border border-rose-200">
                          ✕ REJECTED
                        </span>
                      )}
                    </div>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{call.candidate_name || call.user_name || call.name || 'Unknown Candidate'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Call ID: {call.id || call.call_id || 'N/A'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Status: {status.toUpperCase()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => onDecision(call, 'selected')}
                      disabled={!isCompleted || loadingAction}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        isApproved
                          ? 'bg-emerald-700 text-white ring-2 ring-emerald-400'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {loadingAction ? 'Saving...' : isApproved ? '✓ Approved' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecision(call, 'rejected')}
                      disabled={!isCompleted || loadingAction}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        isRejected
                          ? 'bg-rose-700 text-white ring-2 ring-rose-400'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      {loadingAction ? 'Saving...' : isRejected ? '✕ Rejected' : 'Reject'}
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[0.65rem] uppercase tracking-widest text-slate-500 dark:text-slate-400">Call time</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{formatDate(call.time_of_call)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[0.65rem] uppercase tracking-widest text-slate-500 dark:text-slate-400">Duration</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{formatDuration(call.call_duration)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[0.65rem] uppercase tracking-widest text-slate-500 dark:text-slate-400">Call Rating</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{call.cqs_score || call.metric_score_intent || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function AICallingAgentPage() {
  const token = useSelector(state => state.auth.token)
  const omniApiKey = sessionStorage.getItem('omniDimensionApiKey') || ''

  const [activeTab, setActiveTab] = useState('assistant')
  const [accountVersion, setAccountVersion] = useState(0)
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
  const [phoneError, setPhoneError] = useState('')
  const [candidateResumeInfo, setCandidateResumeInfo] = useState(null)
  const [isCalling, setIsCalling] = useState(false)
  const [availableJobs, setAvailableJobs] = useState([])
  const [selectedJob, setSelectedJob] = useState(null)
  const [availableCandidates, setAvailableCandidates] = useState([])
  const [selectedApplicationId, setSelectedApplicationId] = useState('')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [actionLoadingMap, setActionLoadingMap] = useState({})

  // Excel / CSV Bulk dialer state
  const [dialerMode, setDialerMode] = useState('excel') // 'excel' | 'manual'
  const [spreadsheetFileLabel, setSpreadsheetFileLabel] = useState('')
  const [parsedCandidates, setParsedCandidates] = useState([])
  const [defaultBulkJd, setDefaultBulkJd] = useState('')
  const [bulkCallingProgress, setBulkCallingProgress] = useState({
    active: false,
    current: 0,
    total: 0,
    success: 0,
    fail: 0,
    calling: false
  })

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

  const headers = {
    Authorization: `Bearer ${token}`
  }

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

  const fetchAllOmniValues = async (isManualSync = false) => {
    setLoadingMap({
      assistant: true, callconfig: true, knowledgebase: true,
      integrations: true, postcall: true, recentcalls: true
    })
    try {
      if (isManualSync && token) {
        try {
          const configuredOmniApiKey = omniApiKey || sessionStorage.getItem('omniDimensionApiKey') || ''
          const syncRes = await fetch(`${API_BASE_URL}/api/calls/sync-all`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              ...(configuredOmniApiKey ? { 'X-Omni-Dimension-API-Key': configuredOmniApiKey } : {})
            }
          })
          const syncData = await syncRes.json()
          if (syncRes.ok && syncData.success) {
            if (typeof Swal !== 'undefined') {
              Swal.fire({
                title: 'Omni Dimension Synced!',
                text: 'Synced all data linked with your account & API key: Assistant Details, Conversation Flow, Call Config, Knowledge Base, Integrations, Post-Call, Recent Calls, Candidate Approvals & Bulk Dialer.',
                icon: 'success',
                timer: 3200,
                showConfirmButton: false
              })
            }
          }
        } catch (syncErr) {
          console.warn('[Sync Note] Backend sync-all error:', syncErr)
        }
      }

      await Promise.allSettled([
        fetchAssistant(),
        fetchCallConfig(),
        fetchKnowledgeBase(),
        fetchIntegrations(),
        fetchPostCall(),
        fetchRecentCalls()
      ])
    } catch (e) {
      console.error("Error fetching all Omni values:", e)
    } finally {
      setLoadingMap({
        assistant: false, callconfig: false, knowledgebase: false,
        integrations: false, postcall: false, recentcalls: false
      })
    }
  }

  const handleCallDecision = async (call, decision) => {
    const linkId = getAICallLinkId(call)
    if (!linkId) {
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error', 'Unable to determine call candidate mapping for approval.', 'error')
      } else {
        alert('Unable to determine call candidate mapping for approval.')
      }
      return
    }

    setActionLoadingMap(prev => ({ ...prev, [linkId]: true }))
    try {
      const res = await fetch(`${API_BASE_URL}/admin/update-decision`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ link_id: linkId, decision })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Unable to update decision')
      }

      // Dynamically update candidate decision in local state
      setRecentCalls(prev => prev.map(c => {
        const cLinkId = getAICallLinkId(c)
        if (cLinkId === linkId) {
          return { ...c, decision }
        }
        return c
      }))

      const actionText = decision === 'selected' ? 'Approved' : 'Rejected'
      const msg = data.email_sent 
        ? `Candidate ${actionText.toLowerCase()}! Notification email sent successfully.`
        : `Candidate ${actionText.toLowerCase()} successfully.`

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: `Candidate ${actionText}!`,
          text: msg,
          icon: decision === 'selected' ? 'success' : 'info',
          timer: 2500,
          showConfirmButton: false
        })
      } else {
        alert(msg)
      }
      fetchRecentCalls()
    } catch (err) {
      console.error(err)
      const errAlert = `Failed to update decision: ${err.message || err}`
      if (typeof Swal !== 'undefined') {
        Swal.fire('Error', errAlert, 'error')
      } else {
        alert(errAlert)
      }
    } finally {
      setActionLoadingMap(prev => ({ ...prev, [linkId]: false }))
    }
  }

  useEffect(() => {
    if (!token) return
    fetchAllOmniValues()
  }, [token, accountVersion])

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
    const rawPhones = (manualCall.phone || '').split(',').map(p => p.trim()).filter(Boolean)
    if (rawPhones.length === 0) {
      setPhoneError('Phone number(s) required')
      alert('Please enter at least one phone number')
      return
    }
    
    const validPhones = []
    const invalidPhones = []
    for (const raw of rawPhones) {
      const cleanPhone = raw.replace(/\D/g, '')
      if (cleanPhone.length >= 10 && cleanPhone.length <= 15) validPhones.push(cleanPhone)
      else invalidPhones.push(raw)
    }

    if (invalidPhones.length > 0) {
      const proceed = window.confirm(`The following phone number(s) are invalid and will be skipped:\n${invalidPhones.join(', ')}\n\nDo you want to continue calling the ${validPhones.length} valid number(s)?`);
      if (!proceed) return;
    }

    if (validPhones.length === 0) {
      setPhoneError('No valid phone numbers to call.');
      alert('No valid phone numbers found. Please enter at least one valid 10-15 digit number.');
      return;
    }
    setPhoneError('')
    setIsCalling(true)
    
    let successCount = 0;
    let failCount = 0;
    let errorMsgs = [];
    
    try {
      // Deduplicate validPhones to avoid calling the same number twice
      const uniqueValidPhones = [...new Set(validPhones)]
      for (const phone of uniqueValidPhones) {
        // Find matched candidate to use their actual name
        const matchedCandidate = availableCandidates && availableCandidates.find(c => c.phone && c.phone.replace(/\D/g, '') === phone);
        const nameToUse = matchedCandidate ? matchedCandidate.name : (manualCall.name || 'Candidate');
        const appIdToUse = matchedCandidate ? (matchedCandidate._id || matchedCandidate.id) : selectedApplicationId;
        
        const formData = new FormData()
        formData.append('phone_number', phone)
        formData.append('candidate_name', nameToUse)
        formData.append('job_description', manualCall.jobDesc)
        if (selectedJobId) formData.append('job_id', selectedJobId)
        if (appIdToUse) formData.append('application_id', appIdToUse)
        if (manualCall.resume) formData.append('resume', manualCall.resume)
        
        const r = await fetch(`${API_BASE_URL}/api/calls/initiate-manual`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
        })
        const d = await r.json()
        if (r.ok) {
          successCount++
        } else {
          failCount++
          errorMsgs.push(`${phone}: ${d.detail || 'Unknown error'}`)
        }
      }
      
      let finalMsg = `Successfully initiated ${successCount} call(s).`
      if (failCount > 0) {
        finalMsg += `\nFailed ${failCount} call(s):\n${errorMsgs.join('\n')}`
      }
      alert(finalMsg)
      if (successCount > 0 && failCount === 0) {
        setManualCall({ phone: '', name: '', jobDesc: '', resume: null })
      }
    } catch (e) { alert('Error: ' + e.message) } finally { setIsCalling(false) }
  }

  const downloadBulkDialerTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Phone Number,Candidate Name,Job Description\n9876543210,John Doe,\"Senior Software Engineer role requiring React and Python experience\"\n8765432109,Jane Smith,\"Full Stack Developer role with Node.js and MongoDB\""
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", "bulk_dialer_template.csv")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleSpreadsheetFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    setSpreadsheetFileLabel(`Reading ${file.name}...`)

    const reader = new FileReader()

    const parseRows = (rows) => {
      if (!rows || rows.length === 0) {
        setSpreadsheetFileLabel('No data found in file')
        return
      }

      let headers = []
      let dataRows = []

      if (Array.isArray(rows[0])) {
        headers = rows[0].map(h => String(h || '').trim().toLowerCase())
        dataRows = rows.slice(1)
      } else if (typeof rows[0] === 'object') {
        headers = Object.keys(rows[0]).map(h => h.trim().toLowerCase())
        dataRows = rows
      }

      const findColIndex = (keywords) => {
        return headers.findIndex(h => keywords.some(k => h.includes(k)))
      }

      let phoneIdx = findColIndex(['phone', 'mobile', 'contact', 'number', 'tel'])
      let nameIdx = findColIndex(['name', 'candidate', 'applicant'])
      let jdIdx = findColIndex(['jd', 'job', 'desc', 'role', 'requirement'])

      if (phoneIdx === -1) phoneIdx = 0
      if (nameIdx === -1) nameIdx = 1
      if (jdIdx === -1) jdIdx = 2

      const newParsed = []

      dataRows.forEach((row, idx) => {
        let rawPhone = ''
        let rawName = ''
        let rawJd = ''

        if (Array.isArray(row)) {
          rawPhone = String(row[phoneIdx] || '').trim()
          rawName = String(row[nameIdx] || '').trim()
          rawJd = String(row[jdIdx] || '').trim()
        } else if (row && typeof row === 'object') {
          const keys = Object.keys(row)
          const getVal = (defaultIndex, keywords) => {
            const matchedKey = keys.find(k => keywords.some(kw => k.toLowerCase().includes(kw)))
            if (matchedKey) return String(row[matchedKey] || '').trim()
            return keys[defaultIndex] ? String(row[keys[defaultIndex]] || '').trim() : ''
          }
          rawPhone = getVal(phoneIdx, ['phone', 'mobile', 'contact', 'number', 'tel'])
          rawName = getVal(nameIdx, ['name', 'candidate', 'applicant'])
          rawJd = getVal(jdIdx, ['jd', 'job', 'desc', 'role', 'requirement'])
        }

        const digitsOnly = rawPhone.replace(/\D/g, '')
        let cleanPhone = digitsOnly
        if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) cleanPhone = digitsOnly.slice(2)
        else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) cleanPhone = digitsOnly.slice(1)

        if (rawPhone.toLowerCase().includes('phone') || rawName.toLowerCase().includes('name')) return

        if (cleanPhone || rawName || rawJd) {
          const isValidPhone = cleanPhone.length >= 10 && cleanPhone.length <= 15
          newParsed.push({
            id: `row-${idx}-${Date.now()}`,
            phone: cleanPhone || rawPhone,
            rawPhone: rawPhone,
            name: rawName || `Candidate ${idx + 1}`,
            jobDesc: rawJd,
            isValidPhone: isValidPhone,
            status: isValidPhone ? 'ready' : 'invalid',
            statusDetail: isValidPhone ? 'Ready' : 'Invalid number'
          })
        }
      })

      if (newParsed.length === 0) {
        setSpreadsheetFileLabel('No valid candidate rows found')
        if (typeof Swal !== 'undefined') {
          Swal.fire('Import Warning', 'No candidate rows could be parsed from the file.', 'warning')
        }
      } else {
        setParsedCandidates(newParsed)
        setSpreadsheetFileLabel(`${file.name} (${newParsed.length} candidates loaded)`)
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Import Successful!',
            text: `Loaded ${newParsed.length} candidates from ${file.name}`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          })
        }
      }
    }

    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (event) => {
        try {
          if (!window.XLSX) throw new Error("SheetJS library not loaded")
          const workbook = window.XLSX.read(event.target.result, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
          parseRows(rows)
        } catch (err) {
          console.error("Error reading Excel:", err)
          setSpreadsheetFileLabel('Failed to parse Excel file')
          alert(`Error reading Excel file: ${err.message}`)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = (event) => {
        try {
          const content = event.target.result
          if (window.XLSX) {
            const workbook = window.XLSX.read(content, { type: 'string' })
            const sheet = workbook.Sheets[workbook.SheetNames[0]]
            const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
            parseRows(rows)
          } else {
            const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
            const rows = lines.map(line => line.split(',').map(c => c.replace(/^["']|["']$/g, '').trim()))
            parseRows(rows)
          }
        } catch (err) {
          console.error("Error reading CSV:", err)
          setSpreadsheetFileLabel('Failed to parse CSV file')
          alert(`Error reading CSV file: ${err.message}`)
        }
      }
      reader.readAsText(file)
    }
  }

  const handleBulkExecuteCalls = async () => {
    const validCandidates = parsedCandidates.filter(c => c.isValidPhone)
    if (validCandidates.length === 0) {
      if (typeof Swal !== 'undefined') {
        Swal.fire('No Valid Numbers', 'No candidates with valid phone numbers to call.', 'warning')
      } else {
        alert("No candidates with valid phone numbers to call.")
      }
      return
    }

    let confirmStart = true
    if (typeof Swal !== 'undefined') {
      const res = await Swal.fire({
        title: 'Start Bulk Calling?',
        text: `Launch automated AI calls to ${validCandidates.length} candidate(s)?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Start Calling',
        confirmButtonColor: '#4f46e5'
      })
      confirmStart = res.isConfirmed
    } else {
      confirmStart = window.confirm(`Launch bulk AI calls to ${validCandidates.length} candidate(s)?`)
    }

    if (!confirmStart) return

    setBulkCallingProgress({
      active: true,
      current: 0,
      total: validCandidates.length,
      success: 0,
      fail: 0,
      calling: true
    })

    let succCount = 0
    let failCount = 0

    for (let i = 0; i < validCandidates.length; i++) {
      const candidate = validCandidates[i]

      // Mark row as calling
      setParsedCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, status: 'calling', statusDetail: 'Dialing...' } : c))

      const cJd = candidate.jobDesc || defaultBulkJd || (selectedJob ? selectedJob.description : '') || ''
      const formData = new FormData()
      formData.append('phone_number', candidate.phone)
      formData.append('candidate_name', candidate.name || 'Candidate')
      formData.append('job_description', cJd)
      if (selectedJobId) formData.append('job_id', selectedJobId)

      try {
        const response = await fetch(`${API_BASE_URL}/api/calls/initiate-manual`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })

        const data = await response.json()

        if (response.ok) {
          succCount++
          setParsedCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, status: 'initiated', statusDetail: 'Initiated' } : c))
        } else {
          failCount++
          setParsedCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, status: 'failed', statusDetail: data.detail || 'Failed' } : c))
        }
      } catch (err) {
        failCount++
        setParsedCandidates(prev => prev.map(c => c.id === candidate.id ? { ...c, status: 'failed', statusDetail: err.message || 'Error' } : c))
      }

      setBulkCallingProgress(prev => ({
        ...prev,
        current: i + 1,
        success: succCount,
        fail: failCount
      }))

      if (i < validCandidates.length - 1) {
        await new Promise(r => setTimeout(r, 400))
      }
    }

    setBulkCallingProgress(prev => ({ ...prev, calling: false }))

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Bulk Calling Completed!',
        html: `<p class="text-sm font-semibold">Successfully initiated: <strong class="text-emerald-600">${succCount}</strong> call(s)<br/>Failed: <strong class="text-rose-600">${failCount}</strong> call(s)</p>`,
        icon: succCount > 0 ? 'success' : 'warning',
        confirmButtonColor: '#4f46e5'
      })
    } else {
      alert(`Bulk calling finished!\nInitiated: ${succCount}\nFailed: ${failCount}`)
    }

    fetchRecentCalls()
  }

  const handleRemoveParsedCandidate = (id) => {
    setParsedCandidates(prev => prev.filter(c => c.id !== id))
  }

  const handleAddCandidateRow = () => {
    setParsedCandidates(prev => [
      ...prev,
      {
        id: `manual-row-${Date.now()}`,
        phone: '',
        rawPhone: '',
        name: '',
        jobDesc: '',
        isValidPhone: false,
        status: 'invalid',
        statusDetail: 'Enter phone number'
      }
    ])
  }

  const handleUpdateCandidateRow = (id, field, value) => {
    setParsedCandidates(prev => prev.map(c => {
      if (c.id !== id) return c
      const updated = { ...c, [field]: value }
      if (field === 'phone') {
        const digitsOnly = value.replace(/\D/g, '')
        updated.phone = digitsOnly || value
        updated.isValidPhone = digitsOnly.length >= 10 && digitsOnly.length <= 15
        updated.status = updated.isValidPhone ? 'ready' : 'invalid'
        updated.statusDetail = updated.isValidPhone ? 'Ready' : 'Invalid number'
      }
      return updated
    }))
  }

  const TABS = [
    { id: 'assistant', label: 'Assistant Details', icon: <Radio size={15} /> },
    { id: 'conversationflow', label: 'Conversational Flow', icon: <MessageSquare size={15} /> },
    { id: 'callconfig', label: 'Call Configuration', icon: <Cog size={15} /> },
    { id: 'knowledgebase', label: 'Knowledge Base', icon: <BookOpen size={15} /> },
    { id: 'integrations', label: 'Integrations', icon: <Plug size={15} /> },
    { id: 'postcall', label: 'Post-Call', icon: <MailCheck size={15} /> },
    { id: 'recentcalls', label: 'Recent Calls', icon: <Clock size={15} /> },
    { id: 'approval', label: 'Approval', icon: <CheckCircle2 size={15} /> },
    { id: 'dialer', label: 'Bulk Dialer', icon: <Phone size={15} /> },
  ]

  return (
    <div className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 lg:p-8 pb-24 relative">
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10 relative z-10"
      >
        <div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-[0.7rem] font-bold tracking-widest uppercase mb-4 shadow-xs"
          >
            <Radio size={14} className="animate-pulse text-indigo-600 dark:text-indigo-400" /> Omni Dimension Integration
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="text-4xl sm:text-5xl font-black leading-[1.05] text-foreground tracking-tight mb-2"
          >
            AI Calling Agent
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground mt-3 max-w-2xl text-sm leading-relaxed font-medium"
          >
            Live sync of your Omni Dimension AI Voice Agent — knowledge base, integrations, call configuration, post-call settings, and recent calls.
          </motion.p>
        </div>
        <div className="w-full sm:w-auto flex sm:items-end justify-end">
          <button
            type="button"
            onClick={() => fetchAllOmniValues(true)}
            className="rounded-xl bg-card border border-border px-4 py-2.5 text-xs font-bold text-foreground hover:bg-muted/40 transition-colors shadow-sm flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={14} className="text-indigo-500 animate-spin-hover" /> Sync Agent Settings
          </button>
        </div>
      </motion.div>

      {/* Light card wrapping tabs + content */}
      <motion.div 
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="mt-6 bg-white dark:bg-slate-800/60/80 backdrop-blur-xl rounded-[30px] border border-white/60 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10"
      >
        {/* Tab Bar */}
        <div className="flex items-center flex-wrap gap-2 px-4 pt-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60/50 relative z-10">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold rounded-t-xl transition-colors whitespace-nowrap outline-none ${
                activeTab === id
                  ? 'text-indigo-700'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
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
        <div className="p-6 md:p-8 min-h-[500px] relative z-10 bg-slate-50 dark:bg-slate-900/50/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {activeTab === 'assistant' && (
                <AssistantDetailsTab
                  agentSettings={agentSettings}
                  loading={loadingMap.assistant}
                  token={token}
                  omniApiKey={omniApiKey}
                  onRefresh={fetchAssistant}
                />
              )}
              {activeTab === 'conversationflow' && <ConversationalFlowPage />}
              {activeTab === 'callconfig' && (
                <CallConfigTab
                  config={callConfig}
                  loading={loadingMap.callconfig}
                  onRefresh={fetchCallConfig}
                />
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
                        const token = sessionStorage.getItem('token');
                        const r = await fetch(`${API_BASE_URL}/api/calls/integrations`, {
                          headers: {
                            Authorization: `Bearer ${token}`
                          }
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
                <PostCallTab
                  configs={postCallConfigs}
                  loading={loadingMap.postcall}
                  onRefresh={fetchPostCall}
                />
              )}
              {activeTab === 'recentcalls' && (
                <RecentCallsTab
                  calls={recentCalls}
                  loading={loadingMap.recentcalls}
                  onViewDetails={setSelectedCallId}
                />
              )}
              {activeTab === 'approval' && (
                <ApprovalCallsTab
                  calls={recentCalls}
                  loading={loadingMap.recentcalls}
                  onViewDetails={setSelectedCallId}
                  onDecision={handleCallDecision}
                  actionLoadingMap={actionLoadingMap}
                />
              )}
              {activeTab === 'dialer' && (
                <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
                  {/* Header & Mode Selector */}
                  <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-1">
                        <Phone size={22} className="text-indigo-600" /> Bulk Dialer
                      </h3>
                      <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm font-medium">
                        Upload an Excel or CSV file containing candidate Phone Numbers, Names, and Job Descriptions to initiate bulk AI calls.
                      </p>
                    </div>

                    {/* Mode Toggle Switch */}
                    <div className="inline-flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDialerMode('excel')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                          dialerMode === 'excel'
                            ? 'bg-white dark:bg-slate-800/60 text-indigo-600 shadow-sm border border-slate-200 dark:border-slate-700/60'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <FileSpreadsheet size={14} /> Excel / CSV Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setDialerMode('manual')}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                          dialerMode === 'manual'
                            ? 'bg-white dark:bg-slate-800/60 text-indigo-600 shadow-sm border border-slate-200 dark:border-slate-700/60'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100'
                        }`}
                      >
                        <User size={14} /> Manual Form
                      </button>
                    </div>
                  </div>

                  {/* Mode 1: Excel / CSV Selection & Upload */}
                  {dialerMode === 'excel' && (
                    <div className="space-y-6">
                      {/* Upload Card */}
                      <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                              <Upload size={16} className="text-indigo-500" /> Select Excel / CSV Spreadsheet
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              Columns auto-detected: <code className="bg-slate-100 dark:bg-slate-800/50 px-1 py-0.5 rounded text-[0.7rem] font-bold text-slate-700 dark:text-slate-200">Phone Number</code>, <code className="bg-slate-100 dark:bg-slate-800/50 px-1 py-0.5 rounded text-[0.7rem] font-bold text-slate-700 dark:text-slate-200">Candidate Name</code>, <code className="bg-slate-100 dark:bg-slate-800/50 px-1 py-0.5 rounded text-[0.7rem] font-bold text-slate-700 dark:text-slate-200">Job Description</code>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={downloadBulkDialerTemplate}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                          >
                            <Download size={13} /> Download Template
                          </button>
                        </div>

                        {/* File Dropzone */}
                        <div className="relative border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-2xl p-6 transition-all text-center group cursor-pointer">
                          <input
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={handleSpreadsheetFileUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <div className="flex flex-col items-center justify-center gap-2 pointer-events-none">
                            <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800/60 text-indigo-600 shadow-sm border border-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <FileSpreadsheet size={24} />
                            </div>
                            <div>
                              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                                {spreadsheetFileLabel || "Click or drop Excel (.xlsx, .xls) or CSV (.csv) here"}
                              </span>
                              <p className="text-xs text-slate-400 font-medium mt-0.5">
                                Instant parsing & validation of candidates, phone numbers, and JDs
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Optional Global Default Job Description */}
                        <div>
                          <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                            Default / Fallback Job Description (Optional)
                          </label>
                          <textarea
                            value={defaultBulkJd}
                            onChange={e => setDefaultBulkJd(e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 h-20 resize-none transition-all font-medium"
                            placeholder="Enter a default Job Description to apply if any row in the spreadsheet leaves the JD column empty..."
                          />
                        </div>
                      </div>

                      {/* Parsed Candidates Preview Table */}
                      {parsedCandidates.length > 0 && (
                        <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                          {/* Live Bulk Calling Progress Bar */}
                          {bulkCallingProgress.active && (
                            <div className="bg-slate-900 text-white p-4.5 rounded-xl shadow-md border border-slate-800 space-y-2.5 mb-2">
                              <div className="flex items-center justify-between text-xs font-bold">
                                <span className="flex items-center gap-2">
                                  <Activity size={15} className={`text-indigo-400 ${bulkCallingProgress.calling ? 'animate-spin' : ''}`} />
                                  {bulkCallingProgress.calling ? `Initiating Outbound Calls (${bulkCallingProgress.current} of ${bulkCallingProgress.total})` : 'Bulk Calling Completed'}
                                </span>
                                <span className="font-mono text-indigo-300">
                                  {Math.round((bulkCallingProgress.current / (bulkCallingProgress.total || 1)) * 100)}%
                                </span>
                              </div>

                              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5">
                                <div
                                  className="h-full bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full transition-all duration-300 shadow-sm"
                                  style={{ width: `${Math.round((bulkCallingProgress.current / (bulkCallingProgress.total || 1)) * 100)}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[0.7rem] font-bold text-slate-300 pt-0.5">
                                <span className="text-emerald-400">✓ Initiated: {bulkCallingProgress.success}</span>
                                <span className="text-rose-400">✕ Failed: {bulkCallingProgress.fail}</span>
                                <span>Remaining: {Math.max(0, bulkCallingProgress.total - bulkCallingProgress.current)}</span>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                            <div className="flex items-center gap-3">
                              <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
                                Loaded Candidate Preview ({parsedCandidates.length})
                              </h4>
                              <span className="text-[0.68rem] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                                {parsedCandidates.filter(c => c.isValidPhone).length} Valid
                              </span>
                              {parsedCandidates.filter(c => !c.isValidPhone).length > 0 && (
                                <span className="text-[0.68rem] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                  {parsedCandidates.filter(c => !c.isValidPhone).length} Invalid
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={handleAddCandidateRow}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Plus size={13} /> Add Candidate
                              </button>
                              <button
                                type="button"
                                onClick={() => setParsedCandidates([])}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 size={13} /> Clear All
                              </button>
                            </div>
                          </div>

                          {/* Interactive Spreadsheet Table */}
                          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-xl">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-[0.7rem] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                  <th className="py-3 px-3 w-10 text-center">#</th>
                                  <th className="py-3 px-3 min-w-[140px]">Candidate Name</th>
                                  <th className="py-3 px-3 min-w-[150px]">Phone Number</th>
                                  <th className="py-3 px-3 min-w-[200px]">Job Description</th>
                                  <th className="py-3 px-3 min-w-[110px]">Status</th>
                                  <th className="py-3 px-3 w-14 text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-slate-700 dark:text-slate-200 font-medium">
                                {parsedCandidates.map((c, i) => (
                                  <tr key={c.id} className="hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700/80 transition-colors">
                                    <td className="py-2.5 px-3 text-center text-slate-400 font-bold">{i + 1}</td>
                                    <td className="py-2.5 px-3">
                                      <input
                                        type="text"
                                        value={c.name}
                                        onChange={e => handleUpdateCandidateRow(c.id, 'name', e.target.value)}
                                        className="w-full bg-transparent border-0 focus:bg-white dark:bg-slate-800/60 focus:ring-1 focus:ring-indigo-500 rounded px-1.5 py-1 text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none"
                                        placeholder="Candidate Name"
                                      />
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="relative">
                                        <input
                                          type="text"
                                          value={c.phone}
                                          onChange={e => handleUpdateCandidateRow(c.id, 'phone', e.target.value)}
                                          className={`w-full border rounded px-2 py-1 text-xs font-semibold outline-none transition-all ${
                                            c.isValidPhone
                                              ? 'border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100'
                                              : 'border-rose-400 bg-rose-50/50 text-rose-800 focus:ring-1 focus:ring-rose-500'
                                          }`}
                                          placeholder="10-digit Phone"
                                        />
                                      </div>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <input
                                        type="text"
                                        value={c.jobDesc}
                                        onChange={e => handleUpdateCandidateRow(c.id, 'jobDesc', e.target.value)}
                                        className="w-full bg-transparent border-0 focus:bg-white dark:bg-slate-800/60 focus:ring-1 focus:ring-indigo-500 rounded px-1.5 py-1 text-xs text-slate-600 dark:text-slate-400 outline-none truncate"
                                        placeholder={defaultBulkJd ? "Using default JD..." : "Enter JD for candidate..."}
                                      />
                                    </td>
                                    <td className="py-2.5 px-3">
                                      {c.status === 'initiated' ? (
                                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                                          <CheckCircle2 size={11} /> Initiated
                                        </span>
                                      ) : c.status === 'failed' ? (
                                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                          <XCircle size={11} /> Failed
                                        </span>
                                      ) : c.isValidPhone ? (
                                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                                          <CheckCircle size={11} /> Ready
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[0.65rem] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                          <AlertCircle size={11} /> Invalid Phone
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveParsedCandidate(c.id)}
                                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                                        title="Remove candidate"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Trigger Action Bar */}
                          <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 dark:border-slate-800">
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                              Ready to call <strong className="text-slate-800 dark:text-slate-100 font-extrabold">{parsedCandidates.filter(c => c.isValidPhone).length}</strong> valid candidate(s).
                            </div>

                            <button
                              type="button"
                              onClick={handleBulkExecuteCalls}
                              disabled={bulkCallingProgress.calling || parsedCandidates.filter(c => c.isValidPhone).length === 0}
                              className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-extrabold text-sm rounded-xl transition-all shadow-lg shadow-indigo-600/25 cursor-pointer justify-center"
                            >
                              {bulkCallingProgress.calling ? (
                                <><Activity size={16} className="animate-spin" /> Initiating Bulk Calls...</>
                              ) : (
                                <><Phone size={16} /> Perform Bulk Calling ({parsedCandidates.filter(c => c.isValidPhone).length})</>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Mode 2: Manual Form Entry */}
                  {dialerMode === 'manual' && (
                    <div className="space-y-5 bg-white dark:bg-slate-800/60 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                          <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Phone Number(s) *</label>
                          <input
                            type="text"
                            value={manualCall.phone}
                            onChange={e => {
                              const val = e.target.value.replace(/[^\d,\s]/g, '');
                              setManualCall({ ...manualCall, phone: val });
                              if (val.trim().length === 0) {
                                setPhoneError('Phone number is required');
                              } else {
                                setPhoneError('');
                              }
                            }}
                            onBlur={e => {
                              if (manualCall.phone.trim().length === 0) {
                                setPhoneError('Phone number is required');
                              } else {
                                setPhoneError('');
                              }
                            }}
                            className={`w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border ${phoneError ? 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-500' : 'border-slate-200 dark:border-slate-700 focus:ring-indigo-500/20 focus:border-indigo-500'} rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 transition-all font-semibold`}
                            placeholder="e.g. 9876543210, 8765432109"
                          />
                          {phoneError && (
                            <p className="text-xs text-rose-500 font-semibold mt-1.5 flex items-center gap-1">
                              <AlertCircle size={13} /> {phoneError}
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Candidate Name</label>
                          <input
                            type="text" value={manualCall.name}
                            onChange={e => setManualCall({ ...manualCall, name: e.target.value.replace(/[0-9]/g, '') })}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold"
                            placeholder="e.g. John Doe"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Job Description</label>
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
                              <div className="flex gap-2 items-center">
                                <select
                                  className="bg-teal-50 border border-teal-100 text-[0.7rem] font-bold text-teal-700 rounded-lg px-2 py-1 outline-none focus:border-teal-500 cursor-pointer"
                                  onChange={(e) => {
                                    const appObjId = e.target.value;
                                    setSelectedApplicationId(appObjId);
                                    if (!appObjId) {
                                      setCandidateResumeInfo(null);
                                      return;
                                    }
                                    const candidate = availableCandidates.find(c => (c._id || c.id) === appObjId);
                                    if (candidate) {
                                      const jobTitle = selectedJob ? selectedJob.title : '';
                                      const jobExp = selectedJob ? selectedJob.experience : '';
                                      const jobSkills = selectedJob ? selectedJob.skills : '';
                                      const jobDescription = selectedJob ? selectedJob.description : '';

                                      const desc = `Role: ${jobTitle}\nExperience: ${jobExp || ''}\nSkills: ${jobSkills || ''}\n\nCandidate Name: ${candidate.name || ''}\nCandidate Email: ${candidate.email || ''}\nCandidate Phone: ${candidate.phone || ''}\nCandidate Resume: ${candidate.resume_text || candidate.resume_url || ''}\n\nJob Description:\n${jobDescription || ''}`;

                                      setManualCall(prev => ({
                                        ...prev,
                                        phone: candidate.phone || '',
                                        name: candidate.name || '',
                                        jobDesc: desc,
                                        resume: null
                                      }));

                                      if (candidate.resume_url || candidate.resume_filename || candidate.resume_text) {
                                        setCandidateResumeInfo({
                                          name: candidate.resume_filename || (candidate.resume_url ? candidate.resume_url.split('/').pop() : 'Application Resume'),
                                          url: candidate.resume_url,
                                          hasText: !!candidate.resume_text
                                        });
                                      } else {
                                        setCandidateResumeInfo(null);
                                      }
                                    }
                                    e.target.value = "";
                                  }}
                                >
                                  <option value="">Auto-fill Candidate...</option>
                                  {availableCandidates.map(c => (
                                    <option key={c._id || c.id} value={c._id || c.id}>{c.name} ({c.email})</option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const candidatesWithPhones = availableCandidates.filter(c => c.phone);
                                    const phones = [...new Set(candidatesWithPhones.map(c => c.phone))].join(', ');
                                    const names = [...new Set(candidatesWithPhones.map(c => c.name))].join(', ');
                                    
                                    const jobTitle = selectedJob ? selectedJob.title : '';
                                    const jobExp = selectedJob ? selectedJob.experience : '';
                                    const jobSkills = selectedJob ? selectedJob.skills : '';
                                    const jobDescription = selectedJob ? selectedJob.description : '';

                                    const desc = `Role: ${jobTitle}\nExperience: ${jobExp || ''}\nSkills: ${jobSkills || ''}\n\nJob Description:\n${jobDescription || ''}`;

                                    setManualCall(prev => ({
                                      ...prev,
                                      phone: phones,
                                      name: names || "Bulk Candidates",
                                      jobDesc: desc,
                                      resume: null
                                    }));
                                    setSelectedApplicationId('');
                                    setCandidateResumeInfo(null);
                                    setPhoneError('');
                                  }}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-[0.7rem] font-bold rounded-lg px-3 py-1.5 outline-none transition-colors shadow-sm"
                                >
                                  Select All
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <textarea
                          value={manualCall.jobDesc}
                          onChange={e => setManualCall({ ...manualCall, jobDesc: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 h-28 resize-none transition-all font-medium"
                          placeholder="Paste job description or role requirements..."
                        />
                      </div>
                      <div>
                        <div className="flex justify-between items-end mb-2">
                          <label className="block text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Resume (PDF/DOCX)
                          </label>
                          {(manualCall.resume || candidateResumeInfo) && (
                            <button 
                              type="button"
                              onClick={() => {
                                setManualCall({ ...manualCall, resume: null });
                                setCandidateResumeInfo(null);
                              }} 
                              className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 transition-colors"
                            >
                              <X size={12}/> Remove
                            </button>
                          )}
                        </div>

                        {manualCall.resume ? (
                          <div className="w-full px-4 py-2.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700 font-semibold flex items-center justify-between">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText size={16} className="shrink-0 text-indigo-600" /> 
                              <span className="truncate">{manualCall.resume.name}</span>
                            </div>
                            <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer font-bold px-2 py-1 hover:bg-indigo-100 rounded-md transition-colors">
                              Replace
                              <input
                                type="file" 
                                accept=".pdf,.doc,.docx"
                                onChange={e => setManualCall({ ...manualCall, resume: e.target.files[0] })}
                                className="hidden"
                              />
                            </label>
                          </div>
                        ) : candidateResumeInfo ? (
                          <div className="w-full px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-xl text-sm text-teal-800 font-semibold flex items-center justify-between">
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText size={16} className="shrink-0 text-teal-600" /> 
                              <span className="truncate">{candidateResumeInfo.name}</span>
                              <span className="text-[0.65rem] font-bold uppercase px-2 py-0.5 bg-teal-100 text-teal-700 rounded-full shrink-0">
                                Auto-attached from Candidate
                              </span>
                            </div>
                            <label className="text-xs text-teal-700 hover:text-teal-900 cursor-pointer font-bold px-2 py-1 hover:bg-teal-100 rounded-md transition-colors">
                              Upload Different
                              <input
                                type="file" 
                                accept=".pdf,.doc,.docx"
                                onChange={e => setManualCall({ ...manualCall, resume: e.target.files[0] })}
                                className="hidden"
                              />
                            </label>
                          </div>
                        ) : (
                          <input
                            type="file" 
                            accept=".pdf,.doc,.docx"
                            onChange={e => setManualCall({ ...manualCall, resume: e.target.files[0] })}
                            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[0.7rem] file:font-bold file:uppercase file:tracking-wider file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200 cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                          />
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
                  )}
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
