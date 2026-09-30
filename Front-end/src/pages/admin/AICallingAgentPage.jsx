import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
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
import ConversationalFlowPage from './ConversationalFlowPage'
import {
  AssistantDetailsTab,
  CallConfigTab,
  KnowledgeBaseTab,
  IntegrationsTab,
  PostCallTab
} from './AICallingAgentConfigTabs'
import {
  RecentCallsTab,
  ApprovalCallsTab,
  getAICallLinkId
} from './AICallingAgentCallsTabs'

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
  const [dialerLanguage, setDialerLanguage] = useState('')
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
        formData.append('language', dialerLanguage)
        
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
      formData.append('language', dialerLanguage)

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
    <div className="w-full p-4 sm:p-6 lg:p-8 pb-24 relative">
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
        className="mt-6 bg-white dark:bg-slate-900 backdrop-blur-xl rounded-[30px] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative z-10"
      >
        {/* Tab Bar */}
        <div className="flex items-center flex-wrap gap-2 px-4 pt-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/90 relative z-10">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={activeTab === id ? { backgroundColor: '#4f46e5', color: '#ffffff', borderColor: '#6366f1' } : {}}
              className={`relative flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl transition-all whitespace-nowrap outline-none cursor-pointer border ${activeTab === id
                ? 'bg-indigo-600 !text-white border-indigo-500 shadow-md ring-2 ring-indigo-500/30'
                : 'bg-slate-100 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80 hover:border-indigo-400/50 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
            >
              <span className="relative z-10 flex items-center gap-2" style={activeTab === id ? { color: '#ffffff' } : {}}>{icon} {label}</span>
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
                  onRefresh={fetchRecentCalls}
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
                <div className="p-4 sm:p-6 w-full space-y-6">
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

                        {/* Bulk Settings */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2">
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              Agent Language
                            </label>
                            <select 
                              value={dialerLanguage}
                              onChange={(e) => setDialerLanguage(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all"
                            >
                              <option value="" disabled>Select Language</option>
                              <option value="english">English</option>
                              <option value="telugu">Telugu</option>
                              <option value="hindi">Hindi</option>
                              <option value="tamil">Tamil</option>
                              <option value="malayalam">Malayalam</option>
                              <option value="kannada">Kannada</option>
                              <option value="multilingual">Multilingual (Auto-match candidate)</option>
                            </select>
                          </div>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pb-2">
                        <div className="md:col-span-2 flex flex-col gap-1.5">
                          <label className="text-[0.7rem] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            Agent Language
                          </label>
                          <select 
                            value={dialerLanguage}
                            onChange={(e) => setDialerLanguage(e.target.value)}
                            className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100 rounded-xl px-4 py-3 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 cursor-pointer transition-all"
                          >
                            <option value="" disabled>Select Language</option>
                            <option value="english">English</option>
                            <option value="telugu">Telugu</option>
                            <option value="hindi">Hindi</option>
                            <option value="tamil">Tamil</option>
                            <option value="malayalam">Malayalam</option>
                            <option value="kannada">Kannada</option>
                            <option value="multilingual">Multilingual (Auto-match candidate)</option>
                          </select>
                        </div>
                      </div>
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
