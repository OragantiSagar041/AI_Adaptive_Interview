import React, { useState, useEffect } from 'react'
import { Link, useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import {
  LayoutDashboard, Users, Briefcase, Calendar, Mail, FileBarChart,
  Search, Download, Video, Monitor, Award, ShieldAlert, ChevronRight, X, RefreshCw, Trash2, Eye
} from 'lucide-react'
import Card from '../components/Card'
import Button from '../components/Button'
import Input from '../components/Input'
import Textarea from '../components/Textarea'
import Select from '../components/Select'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import AdminLayout from '../components/admin/AdminLayout'
// import LoginPanel from '../components/admin/LoginPanel'
import ProfileSettings from '../components/admin/ProfileSettings'
import DashboardStats from '../components/admin/DashboardStats'
import { CandidateFilters, CandidateTable } from '../components/admin/AdminSubComponents'
import { CandidateScorecardModal, EmailPreviewModal, BulkResultsModal, LiveResultsModal, RequestCreditsModal, UpgradePlansModal } from '../components/admin/modals/AdminModals'
import { useCandidateFilters } from '../hooks/useCandidateFilters'
import { exportCandidatesReport } from '../utils/adminExport'
import { getComputedStatus } from '../utils/adminFormatters'

export default function AdminPage({ role = 'admin' }) {
  const navigate = useNavigate()

  // Auth state
  const [token, setToken] = useState(sessionStorage.getItem('adminToken') || '')
  const [adminUser, setAdminUser] = useState(JSON.parse(sessionStorage.getItem('adminUser') || 'null'))
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Sub-admins and dropdown filter states
  const [subAdmins, setSubAdmins] = useState([])
  const [selectedAdminId, setSelectedAdminId] = useState('')

  useEffect(() => {
    if (role === 'superadmin') {
      const fetchSubAdmins = async () => {
        try {
          const res = await fetch(`${API_BASE_URL}/super-admin/admins`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          if (res.ok) {
            const data = await res.json()
            setSubAdmins(data.data || [])
          }
        } catch (err) {
          console.error("Error fetching sub-admins:", err)
        }
      }
      fetchSubAdmins()
    }
  }, [role, token])

  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  // Derive activeTab from URL query param, default to 'dashboard'
  const activeTab = tabParam || 'dashboard'

  // Keep liveResultsModal sync with searchParam
  useEffect(() => {
    if (tabParam === 'live') {
      setLiveResultsModalOpen(true)
    }
  }, [tabParam])

  // Accent color state
  const [accentName, setAccentName] = useState('indigo')

  // Dashboard Data states
  const [interviews, setInterviews] = useState([])
  const [candidates, setCandidates] = useState([])
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, shortlisted: 0 })
  const [loadingData, setLoadingData] = useState(false)

  // Position Creator Form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newPosition, setNewPosition] = useState({
    title: '',
    description: '',
    questions: ['']
  })

  // Candidate Detail Modal state
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [candidateDetail, setCandidateDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  
  // Credit / Razorpay states
  const [showRequestCreditsModal, setShowRequestCreditsModal] = useState(false)
  const [creditsToRequest, setCreditsToRequest] = useState(100)
  const [isRequesting, setIsRequesting] = useState(false)
  const [showUpgradePlansModal, setShowUpgradePlansModal] = useState(false)
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false)
  const [creditRequests, setCreditRequests] = useState([])

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('score')

  // Selection states (for bulk delete)
  const [selectedIds, setSelectedIds] = useState([])

  // Invite candidate state
  const [inviteInterviewId, setInviteInterviewId] = useState(null)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' })
  const [inviting, setInviting] = useState(false)

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 10

  // New create interview form states
  const [createTab, setCreateTab] = useState('single') // 'single' | 'bulk'

  // Single Candidate Form
  const [singleCandidate, setSingleCandidate] = useState({
    name: '',
    email: '',
    resumeText: '',
    jobDescription: '',
    customQuestions: '',
    aiInstructions: '',
    industry: 'General',
    interviewType: 'Technical',
    language: 'English',
    caseStudyCount: 3,
    duration: 30,
    scheduledStart: '',
    scheduledEnd: '',
    recordVideo: true,
    hrScreening: {
      askWorkMode: false,
      workModeType: 'On-site',
      askLocation: false,
      locationType: 'Current',
      askBond: false
    }
  })

  // Parsing & Calculating statuses
  const [resumeParsing, setResumeParsing] = useState(false)
  const [jdParsing, setJdParsing] = useState(false)
  const [customQuestionsParsing, setCustomQuestionsParsing] = useState(false)
  const [aiInstructionsParsing, setAiInstructionsParsing] = useState(false)
  const [atsCalculating, setAtsCalculating] = useState(false)
  const [atsScoreData, setAtsScoreData] = useState(null) // { score, summary, matched_skills, missing_skills }

  // Email Preview Modal
  const [emailPreviewModalOpen, setEmailPreviewModalOpen] = useState(false)
  const [emailTemplate, setEmailTemplate] = useState({
    headHtml: '',
    bodyAttributes: {},
    bodyInnerHtml: ''
  })
  const [customEmailHtml, setCustomEmailHtml] = useState('')
  const [singleCreatedLinks, setSingleCreatedLinks] = useState([]) // [{ name, url, id, email }]

  // Bulk Send Configurations
  const [bulkConfig, setBulkConfig] = useState({
    jobDescription: '',
    customQuestions: '',
    aiInstructions: '',
    industry: 'General',
    interviewType: 'Technical',
    language: 'English',
    caseStudyCount: 3,
    duration: 30,
    scheduledStart: '',
    scheduledEnd: '',
    recordVideo: true,
    hrScreening: {
      askWorkMode: false,
      workModeType: 'On-site',
      askLocation: false,
      locationType: 'Current',
      askBond: false
    }
  })
  const [bulkCandidates, setBulkCandidates] = useState([]) // [{ name, email, record_video }]
  const [bulkCandidateInput, setBulkCandidateInput] = useState({ name: '', email: '' })
  const [bulkJdParsing, setBulkJdParsing] = useState(false)
  const [bulkCustomQuestionsParsing, setBulkCustomQuestionsParsing] = useState(false)
  const [bulkAiInstructionsParsing, setBulkAiInstructionsParsing] = useState(false)
  const [bulkCsvLabel, setBulkCsvLabel] = useState('Click to upload or drag and drop Excel or CSV template')

  // Bulk submission results
  const [bulkResultsModalOpen, setBulkResultsModalOpen] = useState(false)
  const [bulkResultsData, setBulkResultsData] = useState(null)

  // Live monitoring states
  const [liveResultsModalOpen, setLiveResultsModalOpen] = useState(false)
  const [liveSessions, setLiveSessions] = useState([])
  const [ongoingLiveCount, setOngoingLiveCount] = useState(0)
  const [ongoingAlertCount, setOngoingAlertCount] = useState(0)
  const [ongoingAvgConfidence, setOngoingAvgConfidence] = useState(0)
  const [ongoingSpeakingCount, setOngoingSpeakingCount] = useState(0)
  const [ongoingCodingCount, setOngoingCodingCount] = useState(0)
  const [ongoingMonitoredCount, setOngoingMonitoredCount] = useState(0)

  // Dashboard Aggregated Stats (Backend mapped)
  const [dbStats, setDbStats] = useState({
    total: '--',
    pending: '--',
    completed: '--',
    started: '--',
    expired: '--',
    selected: '--',
    rejected: '--',
    avg_score: '--',
    today: '--'
  })

  const accentColors = {
    teal: { primary: '#0d9488', hover: '#0f766e', glow: 'rgba(13, 148, 136, 0.15)' },
    indigo: { primary: '#6366f1', hover: '#4f46e5', glow: 'rgba(99, 102, 241, 0.15)' },
    purple: { primary: '#9333ea', hover: '#7e22ce', glow: 'rgba(147, 51, 234, 0.15)' },
    red: { primary: '#e11d48', hover: '#be123c', glow: 'rgba(225, 29, 72, 0.15)' },
    green: { primary: '#16a34a', hover: '#15803d', glow: 'rgba(22, 163, 74, 0.15)' },
    blue: { primary: '#2563eb', hover: '#1d4ed8', glow: 'rgba(37, 99, 237, 0.15)' }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo
  const hexToRgba = (hex, alpha) => {
    const cleanHex = hex.replace('#', '')
    const value = parseInt(cleanHex, 16)
    const r = (value >> 16) & 255
    const g = (value >> 8) & 255
    const b = value & 255
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const accentWash = hexToRgba(currentAccent.primary, 0.16)
  const accentWashStrong = hexToRgba(currentAccent.primary, 0.26)
  const accentPage = hexToRgba(currentAccent.primary, 0.12)
  const accentPageStrong = hexToRgba(currentAccent.primary, 0.20)

  // Inject CSS override variables
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
    document.documentElement.style.setProperty('--primary-glow', currentAccent.glow)
  }, [accentName, currentAccent])

  // Polling Effect for dashboard stats and ongoing interviews
  useEffect(() => {
    if (!token) return

    const loadDashboardStats = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` }
        const statsUrl = role === 'superadmin'
          ? `${API_BASE_URL}/api/superadmin/dashboard${selectedAdminId ? `?admin_id=${selectedAdminId}` : ''}`
          : `${API_BASE_URL}/admin/dashboard-stats`
        const res = await fetch(statsUrl, { headers })
        if (res.ok) {
          const data = await res.json()
          setDbStats(prev => ({
            ...prev,
            total: data.total ?? 0,
            pending: data.pending ?? 0,
            completed: data.completed ?? 0,
            started: data.started ?? 0,
            expired: data.expired ?? 0,
            selected: data.selected ?? 0,
            rejected: data.rejected ?? 0,
            avg_score: data.avg_score ?? 0,
            today: data.today ?? 0
          }))
          setStats({
            total: data.total ?? 0,
            pending: data.pending ?? 0,
            completed: data.completed ?? 0,
            shortlisted: data.selected ?? 0
          })
        }
      } catch (err) {
        console.error("Dashboard stats polling error:", err)
      }
    }

    const fetchOngoing = async () => {
      try {
        const headers = { 'Authorization': `Bearer ${token}` }
        const ongoingUrl = role === 'superadmin'
          ? `${API_BASE_URL}/api/superadmin/ongoing-interviews${selectedAdminId ? `?admin_id=${selectedAdminId}` : ''}`
          : `${API_BASE_URL}/admin/ongoing-interviews`
        const res = await fetch(ongoingUrl, { headers })
        if (res.ok) {
          const data = await res.json()
          setLiveSessions(data.sessions || [])
          setOngoingMonitoredCount(data.count || 0)

          let live = 0
          let alerts = 0
          let speaking = 0
          let coding = 0

          const sessions = data.sessions || []
          sessions.forEach(s => {
            if (s.online) live++
            if (!s.online && (data.count || 0) > 0) alerts++
            if (s.audio_level > 5) speaking++
            if (s.current_question && s.current_question.toString().includes('code')) coding++
          })

          setOngoingLiveCount(live)
          setOngoingAlertCount(alerts)
          setOngoingSpeakingCount(speaking)
          setOngoingCodingCount(coding)
        }
      } catch (err) {
        console.error("Ongoing interviews polling error:", err)
      }
    }

    loadDashboardStats()
    const statsInterval = setInterval(loadDashboardStats, 12000)

    let ongoingInterval = null
    const hasLiveMonitoring = adminUser?.plan_capabilities?.live_monitoring || role === 'superadmin'
    if (hasLiveMonitoring) {
      fetchOngoing()
      ongoingInterval = setInterval(fetchOngoing, 12000)
    }

    return () => {
      clearInterval(statsInterval)
      if (ongoingInterval) {
        clearInterval(ongoingInterval)
      }
    }
  }, [token, adminUser, selectedAdminId, role])

  // Form input setters
  const handleSingleChange = (key, value) => {
    setSingleCandidate(prev => ({ ...prev, [key]: value }))
  }

  const handleSingleHrChange = (key, value) => {
    setSingleCandidate(prev => ({
      ...prev,
      hrScreening: { ...prev.hrScreening, [key]: value }
    }))
  }

  const handleBulkConfigChange = (key, value) => {
    setBulkConfig(prev => ({ ...prev, [key]: value }))
  }

  const handleBulkHrChange = (key, value) => {
    setBulkConfig(prev => ({
      ...prev,
      hrScreening: { ...prev.hrScreening, [key]: value }
    }))
  }

  // Parse file content
  const handleParseFile = async (file, onParsed, onLoading) => {
    if (!file) return
    onLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/parse-resume`, {
        method: 'POST',
        body: formData
      })
      if (response.ok) {
        const data = await response.json()
        onParsed(null, data)
      } else {
        const err = await response.text()
        onParsed(err || "Failed to parse file")
      }
    } catch (error) {
      onParsed(error.message || "Error parsing file")
    } finally {
      onLoading(false)
    }
  }

  // Check if candidate already has a profile/resume on file
  const handleCheckCandidate = async (email) => {
    if (!email || !email.includes('@')) return
    try {
      const response = await fetch(`${API_BASE_URL}/admin/candidate/check?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.exists && data.resume_text) {
          if (confirm(`Candidate profile found for ${email}. Auto-fill name and resume?`)) {
            setSingleCandidate(prev => ({
              ...prev,
              name: data.candidate_name || prev.name,
              resumeText: data.resume_text
            }))
            if (singleCandidate.jobDescription) {
              handleCalculateAts(data.resume_text, singleCandidate.jobDescription)
            }
          }
        }
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Calculate ATS match score
  const handleCalculateAts = async (resume, jd) => {
    if (!resume || !jd) return
    setAtsCalculating(true)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/ats-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: resume, jd_text: jd })
      })
      if (response.ok) {
        const data = await response.json()
        setAtsScoreData({
          score: data.score || 0,
          summary: data.summary || '',
          matched_skills: data.matched_skills || [],
          missing_skills: data.missing_skills || []
        })
      } else {
        alert("Failed to calculate ATS match score.")
      }
    } catch (e) {
      console.error("ATS score error:", e)
    } finally {
      setAtsCalculating(false)
    }
  }

  // Debounce ATS score trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      if (singleCandidate.resumeText && singleCandidate.jobDescription) {
        handleCalculateAts(singleCandidate.resumeText, singleCandidate.jobDescription)
      }
    }, 1500)
    return () => clearTimeout(timer)
  }, [singleCandidate.resumeText, singleCandidate.jobDescription])

  // Email template builder and editor sync
  const buildEmailHtml = () => {
    const { headHtml, bodyAttributes, bodyInnerHtml } = emailTemplate
    const attrs = Object.entries(bodyAttributes || {})
      .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
      .join(' ')
    return `<!DOCTYPE html><html><head>${headHtml || ''}</head><body ${attrs}>${bodyInnerHtml || ''}</body></html>`
  }

  const handlePreviewEmail = async (type) => {
    let name = 'Candidate Name'
    let email = 'candidate@example.com'
    let jd = 'Job description will appear here'
    let duration = 30
    let start = ''
    let end = ''

    if (type === 'single') {
      name = singleCandidate.name || name
      email = singleCandidate.email || email
      jd = singleCandidate.jobDescription || jd
      duration = singleCandidate.duration
      start = singleCandidate.scheduledStart
      end = singleCandidate.scheduledEnd
    } else {
      if (bulkCandidates.length > 0) {
        name = bulkCandidates[0].name
        email = bulkCandidates[0].email
      }
      jd = bulkConfig.jobDescription || jd
      duration = bulkConfig.duration
      start = bulkConfig.scheduledStart
      end = bulkConfig.scheduledEnd
    }

    const toUtcIso = (val) => {
      if (!val) return ""
      return new Date(val).toISOString()
    }

    try {
      const res = await fetch(`${API_BASE_URL}/admin/preview-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          candidate_name: name,
          candidate_email: email,
          job_description: jd,
          interview_duration: Number(duration),
          scheduled_start: toUtcIso(start),
          scheduled_end: toUtcIso(end)
        })
      })

      if (!res.ok) throw new Error('Failed to get email preview')
      const data = await res.json()

      const parser = new DOMParser()
      const doc = parser.parseFromString(data.html, 'text/html')
      const bodyAttributes = {}
      Array.from(doc.body.attributes).forEach(attr => {
        bodyAttributes[attr.name] = attr.value
      })

      setEmailTemplate({
        headHtml: doc.head ? doc.head.innerHTML : '',
        bodyAttributes,
        bodyInnerHtml: doc.body ? doc.body.innerHTML : data.html
      })

      setEmailPreviewModalOpen(true)
    } catch (e) {
      alert('Could not generate email preview: ' + e.message)
    }
  }

  const handleSaveEmailPreview = () => {
    setCustomEmailHtml(buildEmailHtml())
    setEmailPreviewModalOpen(false)
    alert("Custom email template saved and will be used for invitations!")
  }

  const handleResetEmailPreview = () => {
    setCustomEmailHtml('')
    setEmailPreviewModalOpen(false)
    alert("Reset to default invitation email template.")
  }

  // Generate Single Link Session
  const handleGenerateInterviewLink = async () => {
    const { name, email, resumeText, jobDescription, duration, interviewType, industry, language, caseStudyCount, scheduledStart, scheduledEnd, recordVideo, hrScreening, customQuestions, aiInstructions } = singleCandidate

    if (!name || !email || !resumeText || !jobDescription) {
      alert("Please fill in all required fields (Name, Email, Resume, Job Description).")
      return
    }

    if (duration < 5 || duration > 120) {
      alert("Interview Duration must be between 5 and 120 minutes.")
      return
    }

    const toUtcIso = (val) => {
      if (!val) return ""
      return new Date(val).toISOString()
    }

    setInviting(true)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/create-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          candidate_name: name,
          candidate_email: email,
          resume_text: resumeText,
          job_description: jobDescription,
          admin_id: adminUser?.admin_id || 'admin',
          interview_duration: Number(duration),
          interview_type: interviewType,
          industry: industry,
          language: language,
          record_video: recordVideo,
          custom_email_html: customEmailHtml || "",
          scheduled_start: toUtcIso(scheduledStart),
          scheduled_end: toUtcIso(scheduledEnd),
          hr_screening: hrScreening,
          custom_questions: customQuestions,
          ai_instructions: aiInstructions,
          case_study_count: interviewType === 'Non-Technical' ? Number(caseStudyCount) : 0
        })
      })

      const data = await response.json()
      if (response.ok) {
        let msg = `Secure interview link created successfully!`
        if (data.email_scheduled && data.email_send_at) {
          msg += `\nInvitation scheduled to send to ${email} at ${new Date(data.email_send_at).toLocaleString()}`
        } else if (data.email_sent) {
          msg += `\nInvitation email sent successfully to ${email}!`
        }
        alert(msg)

        setSingleCreatedLinks(prev => [
          ...prev,
          { name, url: data.link_url, id: data.link_id, email }
        ])

        setSingleCandidate(prev => ({
          ...prev,
          name: '',
          email: '',
          resumeText: '',
          scheduledStart: '',
          scheduledEnd: ''
        }))
        setAtsScoreData(null)
        setCustomEmailHtml('')

        loadDashboardData()
      } else {
        alert(data.detail || data.message || "Failed to create session.")
      }
    } catch (e) {
      console.error(e)
      alert("Failed to connect to server.")
    } finally {
      setInviting(false)
    }
  }

  // Excel template downloader
  const downloadExcelTemplate = () => {
    if (window.XLSX) {
      const ws = window.XLSX.utils.aoa_to_sheet([
        ['Name', 'Email'],
        ['John Doe', 'john@example.com'],
        ['Jane Smith', 'jane@example.com']
      ])
      ws['!cols'] = [{ wch: 24 }, { wch: 32 }]
      const wb = window.XLSX.utils.book_new()
      window.XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
      window.XLSX.writeFile(wb, 'interview_candidates_template.xlsx')
      alert('Template downloaded successfully!')
    } else {
      let csvContent = "data:text/csv;charset=utf-8,Name,Email\nJohn Doe,john@example.com\nJane Smith,jane@example.com"
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", "interview_candidates_template.csv")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      alert('CSV Template downloaded!')
    }
  }

  // Bulk Excel/CSV parser
  const handleBulkFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const ext = file.name.split('.').pop().toLowerCase()
    setBulkCsvLabel(`Reading ${file.name}...`)

    const reader = new FileReader()

    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (event) => {
        try {
          if (!window.XLSX) throw new Error("SheetJS XLSX library is not loaded")
          const workbook = window.XLSX.read(event.target.result, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

          let added = 0
          const newCandidates = [...bulkCandidates]
          rows.forEach((row) => {
            const rawName = String(row[0] || '').trim()
            const rawEmail = String(row[1] || '').trim()
            if (!rawName || !rawEmail) return
            if (rawName.toLowerCase() === 'name' && rawEmail.toLowerCase() === 'email') return
            if (!rawEmail.includes('@')) return
            if (!newCandidates.find(c => c.email === rawEmail)) {
              newCandidates.push({ name: rawName, email: rawEmail, record_video: true })
              added++
            }
          })

          setBulkCandidates(newCandidates)
          setBulkCsvLabel(`${file.name} - ${added} candidates imported`)
          alert(`${added} candidates imported successfully!`)
        } catch (err) {
          setBulkCsvLabel('Could not read Excel file')
          alert('Error reading Excel: ' + err.message)
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = (event) => {
        try {
          const lines = event.target.result.split('\n').map(l => l.trim()).filter(Boolean)
          let added = 0
          const newCandidates = [...bulkCandidates]
          lines.forEach(line => {
            const parts = line.split(',')
            if (parts.length >= 2) {
              const name = parts[0].trim().replace(/^["']|["']$/g, '')
              const email = parts[1].trim().replace(/^["']|["']$/g, '')
              if (!name || !email || !email.includes('@')) return
              if (name.toLowerCase() === 'name' && email.toLowerCase() === 'email') return
              if (!newCandidates.find(c => c.email === email)) {
                newCandidates.push({ name, email, record_video: true })
                added++
              }
            }
          })
          setBulkCandidates(newCandidates)
          setBulkCsvLabel(`${file.name} - ${added} candidates imported`)
          alert(`${added} candidates imported successfully!`)
        } catch (err) {
          setBulkCsvLabel('Could not read CSV file')
          alert('Error reading CSV: ' + err.message)
        }
      }
      reader.readAsText(file)
    }
  }

  // Submit bulk invitation sessions
  const handleSendBulkInterviews = async () => {
    const { jobDescription, customQuestions, aiInstructions, industry, interviewType, language, caseStudyCount, duration, recordVideo, scheduledStart, scheduledEnd, hrScreening } = bulkConfig

    if (!jobDescription) {
      alert("Please enter a Job Description.")
      return
    }
    if (bulkCandidates.length === 0) {
      alert("Please add at least one candidate.")
      return
    }

    const toUtcIso = (val) => {
      if (!val) return ""
      return new Date(val).toISOString()
    }

    setInviting(true)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/bulk-create-sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          candidates: bulkCandidates.map(c => ({
            candidate_name: c.name,
            candidate_email: c.email,
            resume_text: '',
            record_video: c.record_video !== undefined ? c.record_video : recordVideo
          })),
          job_description: jobDescription,
          industry_type: industry,
          interview_type: interviewType,
          language: language,
          case_study_count: interviewType === 'Non-Technical' ? Number(caseStudyCount) : 0,
          admin_id: adminUser?.admin_id || 'admin',
          interview_duration: Number(duration),
          record_video: recordVideo,
          custom_email_html: customEmailHtml || "",
          scheduled_start: toUtcIso(scheduledStart),
          scheduled_end: toUtcIso(scheduledEnd),
          hr_screening: hrScreening,
          custom_questions: customQuestions,
          ai_instructions: aiInstructions
        })
      })

      const data = await response.json()
      if (response.ok) {
        alert(`Successfully sent ${data.successful}/${data.total} interviews!`)
        setBulkResultsData(data)
        setBulkResultsModalOpen(true)
        setBulkCandidates([])
        setCustomEmailHtml('')
        loadDashboardData()
      } else {
        alert(data.detail || data.message || "Failed to create bulk sessions.")
      }
    } catch (e) {
      console.error(e)
      alert("Error sending bulk interviews.")
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboardData()
    }
  }, [token, selectedAdminId, role])

  const loadDashboardData = async () => {
    setLoadingData(true)
    try {
      const headers = { 'Authorization': `Bearer ${token}` }

      setInterviews([])

      const sessionsUrl = `${API_BASE_URL}/admin/sessions${selectedAdminId ? `?admin_id=${selectedAdminId}` : ''}`
      const resSessions = await fetch(sessionsUrl, { headers })
      const payloadSessions = await resSessions.json()
      const fetchedCandidates = payloadSessions.sessions || []
      setCandidates(fetchedCandidates)

      const statsUrl = `${API_BASE_URL}/admin/dashboard-stats${selectedAdminId ? `?admin_id=${selectedAdminId}` : ''}`
      const resStats = await fetch(statsUrl, { headers })
      if (resStats.ok) {
        const data = await resStats.json()
        setDbStats(prev => ({
          ...prev,
          total: data.total ?? 0,
          pending: data.pending ?? 0,
          completed: data.completed ?? 0,
          started: data.started ?? 0,
          expired: data.expired ?? 0,
          selected: data.selected ?? 0,
          rejected: data.rejected ?? 0,
          avg_score: data.avg_score ?? 0,
          today: data.today ?? 0
        }))
        setStats({
          total: data.total ?? 0,
          pending: data.pending ?? 0,
          completed: data.completed ?? 0,
          shortlisted: data.selected ?? 0
        })
      }

      if (adminUser?.plan_capabilities?.live_monitoring || role === 'superadmin') {
        const ongoingUrl = `${API_BASE_URL}/admin/ongoing-interviews${selectedAdminId ? `?admin_id=${selectedAdminId}` : ''}`
        const resOngoing = await fetch(ongoingUrl, { headers })
        if (resOngoing.ok) {
          const data = await resOngoing.json()
          setLiveSessions(data.sessions || [])
          setOngoingMonitoredCount(data.count || 0)

          let live = 0
          let alerts = 0
          let speaking = 0
          let coding = 0

          const sessions = data.sessions || []
          sessions.forEach(s => {
            if (s.online) live++
            if (!s.online && (data.count || 0) > 0) alerts++
            if (s.audio_level > 5) speaking++
            if (s.current_question && s.current_question.toString().includes('code')) coding++
          })

          setOngoingLiveCount(live)
          setOngoingAlertCount(alerts)
          setOngoingSpeakingCount(speaking)
          setOngoingCodingCount(coding)
        }
      }

      if (adminUser?.role === 'superadmin' || role === 'superadmin') {
        try {
          const reqRes = await fetch(`${API_BASE_URL}/super-admin/credit-requests`, { headers })
          if (reqRes.ok) {
            const reqData = await reqRes.json()
            setCreditRequests(reqData.data || reqData || [])
          }
        } catch(e){}
      }

    } catch (e) {
      console.error(e)
    } finally {
      setLoadingData(false)
    }
  }

  const handleAddCreditsClick = () => {
    if (adminUser?.role === 'superadmin' || role === 'superadmin') {
      setShowUpgradePlansModal(true)
    } else {
      setShowRequestCreditsModal(true)
    }
  }

  const handleRequestCredits = async () => {
    if (!creditsToRequest || creditsToRequest < 10) return;
    setIsRequesting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/credit-requests`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requested_amount: parseInt(creditsToRequest) })
      });
      if (response.ok) {
        alert("Credit request sent successfully!");
        setShowRequestCreditsModal(false);
      } else {
        alert("Failed to send credit request.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRequesting(false);
    }
  }

  const handleUpdateCreditRequest = async (requestId, status) => {
    try {
      const res = await fetch(`${API_BASE_URL}/super-admin/credit-requests/${requestId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        loadDashboardData()
      } else {
        alert("Failed to update credit request");
      }
    } catch(e){}
  }

  const handleSelectPlan = async (plan) => {
    setIsProcessingUpgrade(true)
    try {
      const orderRes = await fetch(`${API_BASE_URL}/api/razorpay/create-upgrade-order`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_name: plan.name,
          amount_inr: plan.price / 100,
          credits: plan.credits
        })
      });

      if (!orderRes.ok) throw new Error("Failed to create order")
      const orderData = await orderRes.json()

      const options = {
        key: 'rzp_test_YourKeyHere', 
        amount: plan.price,
        currency: 'INR',
        name: 'Hire IQ Credits',
        description: `Purchase ${plan.credits} Credits`,
        order_id: orderData.razorpay_order_id,
        handler: async function (response) {
          try {
            const verifyRes = await fetch(`${API_BASE_URL}/api/razorpay/verify-upgrade`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });
            if (verifyRes.ok) {
              alert("Credits added successfully!")
              setShowUpgradePlansModal(false)
              window.location.reload()
            } else {
              alert("Payment verification failed")
            }
          } catch(e){}
        },
        theme: { color: '#6366f1' }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert(e.message)
    } finally {
      setIsProcessingUpgrade(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const response = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      const payload = await response.json()
      if (!response.ok || payload.status !== 'success') {
        throw new Error(payload.detail || payload.message || "Invalid username or password")
      }

      sessionStorage.setItem('adminToken', payload.token)
      sessionStorage.setItem('adminUser', JSON.stringify(payload))
      setToken(payload.token)
      setAdminUser(payload)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    setToken('')
    setAdminUser(null)
  }

  const handleGenerateLink = async (e) => {
    e.preventDefault()
    if (!inviteForm.name || !inviteForm.email || !inviteInterviewId) {
      alert("All fields are required to invite a candidate.")
      return
    }
    setInviting(true)
    try {
      const response = await fetch(`${API_BASE_URL}/generate-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          interview_id: inviteInterviewId,
          candidate_name: inviteForm.name,
          candidate_email: inviteForm.email
        })
      })
      const payload = await response.json()
      if (response.ok) {
        alert(`Successfully generated secure candidate link:\n${window.location.origin}/interview?session_id=${payload.session_id}`)
        setInviteInterviewId(null)
        setInviteForm({ name: '', email: '' })
        loadDashboardData()
      } else {
        alert(payload.detail || payload.message || "Failed to generate link.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setInviting(false)
    }
  }

  const handleDeleteSession = async (linkId) => {
    if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return
    try {
      const response = await fetch(`${API_BASE_URL}/admin/sessions/${linkId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (response.ok) {
        alert("Session deleted successfully.")
        loadDashboardData()
      } else {
        alert("Failed to delete session.")
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected sessions? This cannot be undone.`)) return

    setLoadingData(true)
    try {
      const promises = selectedIds.map(id =>
        fetch(`${API_BASE_URL}/admin/sessions/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        })
      )
      await Promise.all(promises)
      alert(`Deleted ${selectedIds.length} sessions successfully.`)
      setSelectedIds([])
      loadDashboardData()
    } catch (error) {
      console.error(error)
      alert("An error occurred during bulk deletion.")
    } finally {
      setLoadingData(false)
    }
  }

  const handleAddQuestionField = () => {
    setNewPosition(prev => ({ ...prev, questions: [...prev.questions, ''] }))
  }

  const handleQuestionChange = (index, val) => {
    setNewPosition(prev => {
      const copy = [...prev.questions]
      copy[index] = val
      return { ...prev, questions: copy }
    })
  }

  const handleCreatePosition = async (e) => {
    e.preventDefault()
    if (!newPosition.title || newPosition.questions.filter(q => q.trim()).length === 0) {
      alert("Title and at least one question is required.")
      return
    }

    try {
      const formattedQuestions = newPosition.questions
        .filter(q => q.trim())
        .map((q, idx) => ({
          id: `q_${idx + 1}`,
          text: q,
          type: q.toLowerCase().includes('write code') || q.toLowerCase().includes('function') ? 'coding' : 'text'
        }))

      const response = await fetch(`${API_BASE_URL}/create-interview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newPosition.title,
          description: newPosition.description,
          questions: formattedQuestions
        })
      })
      if (response.ok) {
        setShowCreateForm(false)
        setNewPosition({ title: '', description: '', questions: [''] })
        loadDashboardData()
        alert("Interview position created successfully!")
      } else {
        alert("Failed to create position.")
      }
    } catch (e) {
      console.error(e)
    }
  }

  const handleOpenScorecard = async (candidate) => {
    setSelectedCandidate(candidate)
    setLoadingDetail(true)
    try {
      const res = await fetch(`${API_BASE_URL}/session/${candidate.session_id || candidate.id || candidate.link_id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const payload = await res.json()
      setCandidateDetail(payload.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handleUpdateDecision = async (linkId, decision) => {
    if (!confirm(`Are you sure you want to mark this candidate as ${decision.toUpperCase()}? Official email will be sent.`)) return
    try {
      const response = await fetch(`${API_BASE_URL}/admin/update-decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          link_id: linkId,
          decision: decision
        })
      })
      if (response.ok) {
        alert(`Candidate marked as ${decision.toUpperCase()} successfully.`)
        setSelectedCandidate(prev => prev ? { ...prev, decision } : null)
        loadDashboardData()
      } else {
        const payload = await response.json()
        alert(payload.detail || payload.message || "Failed to update decision.")
      }
    } catch (e) {
      console.error(e)
      alert("Error connecting to server.")
    }
  }

  const handleExportExcel = () => {
    const dataToExport = filteredCandidates
    if (dataToExport.length === 0) {
      alert("No data available to export.")
      return
    }
    exportCandidatesReport(dataToExport.map(c => ({
      ...c,
      status: getComputedStatus(c),
    })))
    alert("Interview_Candidates_Report.csv downloaded!");
  }
  const {
    filteredCandidates,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    paginatedCandidates,
  } = useCandidateFilters({
    candidates,
    searchTerm,
    startDate,
    endDate,
    statusFilter,
    sortBy,
    currentPage,
    pageSize: PAGE_SIZE,
  })

  if (!token) {
    /*
    return (
      <LoginPanel
        loginForm={loginForm}
        loginError={loginError}
        loginLoading={loginLoading}
        onSubmit={handleLogin}
        onChange={setLoginForm}
      />
    )
    */
    return <Navigate to="/login" replace />
  }

  const renderAdminSelector = () => {
    if (role !== 'superadmin') return null
    return (
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-semibold text-slate-500">Filter by Tenant Admin:</span>
        <select
          value={selectedAdminId}
          onChange={(e) => setSelectedAdminId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500 transition-all font-semibold shadow-sm cursor-pointer"
        >
          <option value="">All Admins (Aggregated)</option>
          {subAdmins.map(adm => (
            <option key={adm.id || adm._id} value={adm.id || adm._id}>
              {adm.name || adm.username}
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <>
      <AdminLayout
        role={role}
        activeTab={liveResultsModalOpen ? 'live' : activeTab}
        accentColors={accentColors}
        accentName={accentName}
        currentAccent={currentAccent}
        adminUser={adminUser}
        onAccentChange={setAccentName}
        onLogout={handleLogout}
        onAddCredits={handleAddCreditsClick}
        onTabChange={(tab) => {
          if (tab === 'live') {
            setLiveResultsModalOpen(true)
          } else {
            // Navigate to the correct base route with ?tab= param
            const basePath = role === 'superadmin' ? '/super-admin' : '/admin'
            navigate(`${basePath}?tab=${tab}`)
          }
        }}
      >
        {loadingData ? (
          <div className="flex items-center gap-2.5 text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            <span>Refreshing console workspace...</span>
          </div>
        ) : (
          <>
            {renderAdminSelector()}
            {activeTab === 'dashboard' && (
              <div className="flex flex-col gap-6">
                <DashboardStats
                  dbStats={dbStats}
                  ongoingLiveCount={ongoingLiveCount}
                  ongoingAlertCount={ongoingAlertCount}
                  ongoingSpeakingCount={ongoingSpeakingCount}
                  ongoingCodingCount={ongoingCodingCount}
                  ongoingMonitoredCount={ongoingMonitoredCount}
                  onOpenLiveResults={() => setLiveResultsModalOpen(true)}
                  onStatusFilter={(status) => {
                    setStatusFilter(status)
                    if (status === 'all') {
                      setStartDate('')
                      setEndDate('')
                    }
                  }}
                  onOpenQualified={() => navigate(`${role === 'superadmin' ? '/super-admin' : '/admin'}?tab=qualified`)}
                />
                <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm flex flex-col gap-5 text-slate-800">

                  {/* Panel Header */}
                  <div className="flex justify-between items-start flex-wrap gap-4 px-6 pt-6">
                    <div className="flex gap-3 items-center">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/8 text-primary">
                        <LayoutDashboard size={18} />
                      </div>
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Dashboard Overview</h3>
                        <p className="text-xs text-slate-500">Track ongoing and completed interviews</p>
                      </div>
                    </div>

                    {/* Filters Form Row */}
                    <CandidateFilters
                      searchTerm={searchTerm}
                      setSearchTerm={setSearchTerm}
                      startDate={startDate}
                      setStartDate={setStartDate}
                      endDate={endDate}
                      setEndDate={setEndDate}
                      statusFilter={statusFilter}
                      setStatusFilter={setStatusFilter}
                      sortBy={sortBy}
                      setSortBy={setSortBy}
                      handleExportExcel={handleExportExcel}
                      selectedIds={selectedIds}
                      handleBulkDelete={handleBulkDelete}
                    />
                  </div>

                  <CandidateTable
                    paginatedCandidates={paginatedCandidates}
                    selectedIds={selectedIds}
                    setSelectedIds={setSelectedIds}
                    getComputedStatus={getComputedStatus}
                    handleOpenScorecard={handleOpenScorecard}
                    handleDeleteSession={handleDeleteSession}
                    loadDashboardData={loadDashboardData}
                    API_BASE_URL={API_BASE_URL}
                    totalPages={totalPages}
                    startIndex={startIndex}
                    endIndex={endIndex}
                    totalItems={totalItems}
                    currentPage={currentPage}
                    setCurrentPage={setCurrentPage}
                  />

                  {role === 'superadmin' && creditRequests && creditRequests.length > 0 && (
                    <div className="mt-8 border-t border-slate-100 pt-8 px-6 pb-6 bg-slate-50 rounded-b-xl">
                      <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <i className="fas fa-layer-group text-[#6366f1]"></i> Pending Credit Requests
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse bg-white rounded-xl shadow-sm border border-slate-100">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                              <th className="p-4 rounded-tl-xl">Admin ID</th>
                              <th className="p-4">Requested Credits</th>
                              <th className="p-4">Date</th>
                              <th className="p-4">Status</th>
                              <th className="p-4 text-right rounded-tr-xl">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {creditRequests.map(req => (
                              <tr key={req.id || req._id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="p-4 text-sm font-semibold text-slate-700">{req.admin_id}</td>
                                <td className="p-4 text-sm text-[#6366f1] font-black">+{req.requested_amount}</td>
                                <td className="p-4 text-sm text-slate-500">{new Date(req.created_at).toLocaleDateString()}</td>
                                <td className="p-4">
                                  <span className="bg-amber-100/50 border border-amber-200 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">Pending</span>
                                </td>
                                <td className="p-4 text-right">
                                  <button onClick={() => handleUpdateCreditRequest(req.id || req._id, 'approved')} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold mr-2 shadow-sm transition-colors cursor-pointer">Approve</button>
                                  <button onClick={() => handleUpdateCreditRequest(req.id || req._id, 'rejected')} className="text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold shadow-sm transition-colors cursor-pointer">Reject</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                </Card>
              </div>
            )}

            {/* TAB: QUALIFIED CANDIDATES */}
            {activeTab === 'qualified' && (
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Qualified Candidates</h3>
                    <p className="text-xs text-slate-500">Shortlisted for next hiring rounds</p>
                  </div>
                  <Button
                    onClick={handleExportExcel}
                    variant="secondary"
                    className="bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100/50"
                    icon={<Download size={14} />}
                  >
                    Export Selected
                  </Button>
                </div>

                <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm text-slate-800">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#e5edf7] bg-slate-50">
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Candidate Name</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Interview Profile</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Evaluation Score</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Date Shortlisted</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider text-right pr-6">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef2f7]">
                      {candidates.filter(c => c.decision === 'selected').length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center py-8 text-slate-400 text-sm">No qualified candidates yet.</td>
                        </tr>
                      ) : (
                        candidates.filter(c => c.decision === 'selected').map(c => (
                          <tr key={c.id || c.link_id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-sm font-semibold text-slate-700">{c.candidate_name}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{c.interview_title}</td>
                            <td className="px-4 py-3 text-sm"><strong className="text-success">{Number(c.score || 0).toFixed(1)}/100</strong></td>
                            <td className="px-4 py-3 text-sm text-slate-600">{new Date(c.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-right pr-6">
                              <button
                                onClick={() => handleOpenScorecard(c)}
                                className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded hover:bg-emerald-600 cursor-pointer border-none flex items-center gap-1 ml-auto"
                              >
                                View Scorecard <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {/* TAB: REJECTED CANDIDATES */}
            {activeTab === 'rejected' && (
              <div className="flex flex-col gap-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Rejected Candidates</h3>
                    <p className="text-xs text-slate-500">Unsuccessful applicant profiles</p>
                  </div>
                  <Button
                    onClick={handleExportExcel}
                    variant="secondary"
                    className="bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100/50"
                    icon={<Download size={14} />}
                  >
                    Export Selected
                  </Button>
                </div>

                <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm text-slate-800">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-[#e5edf7] bg-slate-50">
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Candidate Name</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Interview Profile</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Evaluation Score</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Date Reviewed</th>
                        <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider text-right pr-6">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eef2f7]">
                      {candidates.filter(c => c.decision === 'rejected').length === 0 ? (
                        <tr>
                          <td colSpan="5" className="text-center py-8 text-slate-400 text-sm">No rejected candidates yet.</td>
                        </tr>
                      ) : (
                        candidates.filter(c => c.decision === 'rejected').map(c => (
                          <tr key={c.id || c.link_id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-sm font-semibold text-slate-700">{c.candidate_name}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{c.interview_title}</td>
                            <td className="px-4 py-3 text-sm"><strong className="text-rose-500">{Number(c.score || 0).toFixed(1)}/100</strong></td>
                            <td className="px-4 py-3 text-sm text-slate-600">{new Date(c.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3 text-sm text-right pr-6">
                              <button
                                onClick={() => handleOpenScorecard(c)}
                                className="px-3 py-1.5 bg-rose-500 text-white text-xs font-bold rounded hover:bg-rose-600 cursor-pointer border-none flex items-center gap-1 ml-auto"
                              >
                                View Scorecard <ChevronRight size={14} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {/* TAB: CREATE INTERVIEW */}
            {activeTab === 'create' && (
              <div className="flex flex-col gap-6">

                {/* Tab Switcher */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateTab('single')}
                    className={`flex-1 py-3 text-center rounded-xl font-bold text-sm cursor-pointer transition-all border outline-none ${createTab === 'single'
                        ? 'bg-primary text-white border-primary shadow-[0_4px_10px_rgba(99,102,241,0.15)]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <i className="fas fa-user mr-1.5"></i> Single Candidate
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateTab('bulk')}
                    className={`flex-1 py-3 text-center rounded-xl font-bold text-sm cursor-pointer transition-all border outline-none ${createTab === 'bulk'
                        ? 'bg-primary text-white border-primary shadow-[0_4px_10px_rgba(99,102,241,0.15)]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                  >
                    <i className="fas fa-users mr-1.5"></i> Bulk Send
                  </button>
                </div>

                {/* Single candidate panel */}
                {createTab === 'single' && (
                  <div className="flex flex-col gap-6">
                    <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                      <div className="flex gap-3 items-center">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/8 text-primary">
                          <i className="fas fa-bullseye text-lg"></i>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-800">Create Interview Session</h3>
                          <p className="text-xs text-slate-500">
                            Generate a unique link for each candidate
                            <span className="text-warning ml-2 font-semibold text-[0.7rem] bg-warning/8 px-2 py-0.5 rounded">
                              <i className="fas fa-clock mr-1"></i> Valid for 24 hours
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Candidate Name */}
                      <Input
                        label="Candidate Name"
                        placeholder="e.g. John Doe"
                        value={singleCandidate.name}
                        onChange={(e) => handleSingleChange('name', e.target.value)}
                      />

                      {/* Candidate Email */}
                      <Input
                        label="Candidate Email"
                        type="email"
                        placeholder="e.g. john@example.com"
                        value={singleCandidate.email}
                        onChange={(e) => handleSingleChange('email', e.target.value)}
                        onBlur={() => handleCheckCandidate(singleCandidate.email)}
                      />

                      {/* Upload Resume */}
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">Upload Resume (PDF / DOCX / TXT)</label>
                        <div
                          className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer bg-slate-50 hover:bg-slate-100 hover:border-primary transition-all flex flex-col items-center justify-center"
                          onClick={() => document.getElementById('singleResumeInput').click()}
                        >
                          <div className="text-2xl text-primary mb-1.5">
                            <i className="fas fa-file-invoice"></i>
                          </div>
                          <p className="font-semibold text-slate-700 text-sm">
                            {singleCandidate.resumeText ? "Resume uploaded and parsed" : "Click to upload or drag and drop"}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            PDF, DOCX, TXT - Max 5MB
                          </p>
                        </div>
                        <input
                          type="file"
                          id="singleResumeInput"
                          accept=".pdf,.docx,.doc,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0]
                            if (!file) return
                            handleParseFile(file, (err, data) => {
                              if (err) {
                                alert(err)
                                setResumeParsing(false)
                              } else {
                                setSingleCandidate(prev => ({
                                  ...prev,
                                  name: data.name || prev.name,
                                  email: data.email || prev.email,
                                  resumeText: data.text || ''
                                }))
                              }
                            }, setResumeParsing)
                          }}
                        />
                        {resumeParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing resume...</span>}
                        {singleCandidate.resumeText && !resumeParsing && (
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-success font-semibold">Parsed successfully</span>
                            <button
                              type="button"
                              className="bg-transparent border-none text-rose-500 text-xs font-semibold cursor-pointer hover:underline flex items-center gap-1"
                              onClick={() => handleSingleChange('resumeText', '')}
                            >
                              <i className="fas fa-trash"></i> Remove Resume
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Job Description */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">Job Description</label>
                          <button
                            type="button"
                            onClick={() => document.getElementById('singleJdInput').click()}
                            className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-primary bg-transparent border border-primary/20 rounded px-2.5 py-1 cursor-pointer hover:bg-primary/5 transition-all"
                          >
                            <i className="fas fa-paperclip"></i> Upload
                          </button>
                          <input
                            type="file"
                            id="singleJdInput"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) return
                              handleParseFile(file, (err, data) => {
                                if (err) {
                                  alert(err)
                                  setJdParsing(false)
                                } else {
                                  handleSingleChange('jobDescription', data.text || '')
                                }
                              }, setJdParsing)
                            }}
                          />
                        </div>
                        {jdParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing Job Description...</span>}
                        <Textarea
                          placeholder="Paste the job description here or upload a file above..."
                          value={singleCandidate.jobDescription}
                          onChange={(e) => handleSingleChange('jobDescription', e.target.value)}
                        />
                      </div>

                      {/* ATS Match Score */}
                      {atsScoreData && (
                        <div className="bg-primary/5 border border-primary/15 rounded-xl p-4 flex flex-col gap-3">
                          <div className="flex justify-between items-center">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                              <i className="fas fa-chart-pie text-primary"></i> ATS Resume Match Score
                            </h4>
                            <Button
                              onClick={() => handleCalculateAts(singleCandidate.resumeText, singleCandidate.jobDescription)}
                              disabled={atsCalculating}
                              variant="secondary"
                              className="px-3 py-1 text-xs h-[28px] border-slate-200 bg-white"
                            >
                              {atsCalculating ? "Analyzing..." : "Recalculate"}
                            </Button>
                          </div>
                          <div className="flex gap-5 items-start flex-col sm:flex-row">
                            <div className="flex-shrink-0 text-center mx-auto sm:mx-0">
                              <div
                                className="width-20 h-20 w-[80px] h-[80px] rounded-full flex items-center justify-center text-xl font-extrabold text-white shadow-sm"
                                style={{
                                  background: atsScoreData.score >= 75 ? 'linear-gradient(135deg, #10b981, #059669)' : atsScoreData.score >= 50 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ef4444, #dc2626)'
                                }}
                              >
                                {atsScoreData.score}%
                              </div>
                              <div className="text-[0.7rem] text-slate-500 font-bold uppercase tracking-wide mt-1.5">Match Score</div>
                            </div>
                            <div className="flex-grow text-xs text-slate-600 leading-relaxed">
                              <p className="mb-3 font-medium text-slate-700">{atsScoreData.summary}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
                                  <strong className="text-emerald-600 block mb-1 text-[0.7rem] uppercase tracking-wide">Matched Skills</strong>
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {atsScoreData.matched_skills.map((skill, idx) => (
                                      <span key={idx} className="bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded text-[0.68rem] font-medium">{skill}</span>
                                    ))}
                                    {atsScoreData.matched_skills.length === 0 && 'None identified'}
                                  </div>
                                </div>
                                <div className="bg-rose-500/5 p-3 rounded-lg border border-rose-500/10">
                                  <strong className="text-rose-600 block mb-1 text-[0.7rem] uppercase tracking-wide">Missing Skills</strong>
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {atsScoreData.missing_skills.map((skill, idx) => (
                                      <span key={idx} className="bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded text-[0.68rem] font-medium">{skill}</span>
                                    ))}
                                    {atsScoreData.missing_skills.length === 0 && 'None identified'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {atsCalculating && (
                        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center text-xs text-slate-500 font-medium">
                          <i className="fas fa-spinner fa-spin mr-2"></i> Analyzing ATS match score...
                        </div>
                      )}

                      {/* Custom Questions */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">Custom Questions <span className="text-slate-400 font-normal lowercase">(Optional)</span></label>
                          <button
                            type="button"
                            onClick={() => document.getElementById('singleCustomInput').click()}
                            className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-primary bg-transparent border border-primary/20 rounded px-2.5 py-1 cursor-pointer hover:bg-primary/5 transition-all"
                          >
                            <i className="fas fa-paperclip"></i> Upload
                          </button>
                          <input
                            type="file"
                            id="singleCustomInput"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) return
                              handleParseFile(file, (err, data) => {
                                if (err) {
                                  alert(err)
                                  setCustomQuestionsParsing(false)
                                } else {
                                  handleSingleChange('customQuestions', data.text || '')
                                }
                              }, setCustomQuestionsParsing)
                            }}
                          />
                        </div>
                        {customQuestionsParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing file...</span>}
                        <Textarea
                          placeholder="Enter your custom questions here or upload a file. If provided, the AI will ask these first."
                          value={singleCandidate.customQuestions}
                          onChange={(e) => handleSingleChange('customQuestions', e.target.value)}
                        />
                      </div>

                      {/* AI Instructions */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">AI Interview Instructions <span className="text-slate-400 font-normal lowercase">(Optional)</span></label>
                          <button
                            type="button"
                            onClick={() => document.getElementById('singleAiInstructionsInput').click()}
                            className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-primary bg-transparent border border-primary/20 rounded px-2.5 py-1 cursor-pointer hover:bg-primary/5 transition-all"
                          >
                            <i className="fas fa-paperclip"></i> Upload
                          </button>
                          <input
                            type="file"
                            id="singleAiInstructionsInput"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) return
                              handleParseFile(file, (err, data) => {
                                if (err) {
                                  alert(err)
                                  setAiInstructionsParsing(false)
                                } else {
                                  handleSingleChange('aiInstructions', data.text || '')
                                }
                              }, setAiInstructionsParsing)
                            }}
                          />
                        </div>
                        {aiInstructionsParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing file...</span>}
                        <Textarea
                          placeholder="e.g. 'Focus heavily on system design and React performance optimization. Keep questions technical.'"
                          value={singleCandidate.aiInstructions}
                          onChange={(e) => handleSingleChange('aiInstructions', e.target.value)}
                        />
                      </div>

                      {/* Dropdowns row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Select
                          label="Industry Type"
                          value={singleCandidate.industry}
                          onChange={(e) => handleSingleChange('industry', e.target.value)}
                          options={[
                            { value: 'General', label: 'General (No Specific Industry)' },
                            { value: 'Information Technology', label: 'Information Technology' },
                            { value: 'Software & SaaS', label: 'Software & SaaS' },
                            { value: 'Healthcare', label: 'Healthcare' },
                            { value: 'Financial Services', label: 'Financial Services' },
                            { value: 'Education', label: 'Education' },
                            { value: 'Human Resources & Staffing', label: 'Human Resources & Staffing' }
                          ]}
                        />

                        <Select
                          label="Interview Type"
                          value={singleCandidate.interviewType}
                          onChange={(e) => {
                            const type = e.target.value
                            handleSingleChange('interviewType', type)
                            if (type === 'Technical' && singleCandidate.language !== 'English') {
                              alert("Coding round is currently restricted to English language interviews. Switching language to English.")
                              handleSingleChange('language', 'English')
                            }
                          }}
                          options={[
                            { value: 'Technical', label: 'Technical (Includes Coding Round)' },
                            { value: 'Normal', label: 'Normal (Standard AI, No Coding)' },
                            { value: 'Non-Technical', label: 'Non-Technical (Scenario/Case Studies)' }
                          ]}
                        />

                        <Select
                          label="Interview Language"
                          value={singleCandidate.language}
                          onChange={(e) => {
                            const lang = e.target.value
                            handleSingleChange('language', lang)
                            if (lang !== 'English' && singleCandidate.interviewType === 'Technical') {
                              alert("Coding round is currently restricted to English language interviews. Switching to Normal interview type.")
                              handleSingleChange('interviewType', 'Normal')
                            }
                          }}
                          options={['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam', 'Kannada']}
                        />

                        <Input
                          label="Duration (Minutes)"
                          type="number"
                          min="5"
                          max="120"
                          value={singleCandidate.duration}
                          onChange={(e) => {
                            let val = parseInt(e.target.value) || 30
                            if (val > 120) val = 120
                            handleSingleChange('duration', val)
                          }}
                        />
                      </div>

                      {singleCandidate.interviewType === 'Non-Technical' && (
                        <Select
                          label="Number of Case Study Questions (Round 2)"
                          value={singleCandidate.caseStudyCount}
                          onChange={(e) => handleSingleChange('caseStudyCount', parseInt(e.target.value))}
                          options={[
                            { value: '2', label: '2 Questions' },
                            { value: '3', label: '3 Questions' },
                            { value: '4', label: '4 Questions' },
                            { value: '5', label: '5 Questions' }
                          ]}
                        />
                      )}

                      {/* Scheduling Picker */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <i className="fas fa-calendar-check text-primary"></i> Schedule Interview (Optional)
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Start Date & Time"
                            type="datetime-local"
                            value={singleCandidate.scheduledStart}
                            onChange={(e) => handleSingleChange('scheduledStart', e.target.value)}
                          />
                          <Input
                            label="End Date & Time"
                            type="datetime-local"
                            value={singleCandidate.scheduledEnd}
                            onChange={(e) => handleSingleChange('scheduledEnd', e.target.value)}
                          />
                        </div>
                        <p className="text-[0.7rem] text-slate-500 leading-normal">
                          <i className="fas fa-info-circle mr-1"></i> Leave empty for immediate access (24h expiry). If set, candidate can only access during this window.
                        </p>
                      </div>

                      {/* Record Video checkbox */}
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          id="singleRecordVideo"
                          checked={singleCandidate.recordVideo}
                          onChange={(e) => handleSingleChange('recordVideo', e.target.checked)}
                          className="w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="singleRecordVideo" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                          Record Interview Video
                        </label>
                      </div>

                      {/* HR Screening parameters */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <i className="fas fa-clipboard-check text-primary"></i> HR Screening Questions (Optional)
                        </label>
                        <p className="text-[0.72rem] text-slate-500 leading-normal">
                          When enabled, AI will extract info from the job description and ask additional screening questions at the end of the interview.
                        </p>

                        <div className="flex flex-col gap-3 mt-1">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="singleAskWorkMode"
                                checked={singleCandidate.hrScreening.askWorkMode}
                                onChange={(e) => handleSingleHrChange('askWorkMode', e.target.checked)}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <label htmlFor="singleAskWorkMode" className="text-xs font-semibold text-slate-700 cursor-pointer">Work Mode</label>
                            </div>
                            {singleCandidate.hrScreening.askWorkMode && (
                              <div className="flex gap-4 ml-6 items-center">
                                {['On-site', 'Remote', 'Hybrid'].map(mode => (
                                  <label key={mode} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 font-medium">
                                    <input
                                      type="radio"
                                      name="singleWorkModeType"
                                      value={mode}
                                      checked={singleCandidate.hrScreening.workModeType === mode}
                                      onChange={() => handleSingleHrChange('workModeType', mode)}
                                    />
                                    {mode}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="singleAskLocation"
                                checked={singleCandidate.hrScreening.askLocation}
                                onChange={(e) => handleSingleHrChange('askLocation', e.target.checked)}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <label htmlFor="singleAskLocation" className="text-xs font-semibold text-slate-700 cursor-pointer">Location</label>
                            </div>
                            {singleCandidate.hrScreening.askLocation && (
                              <div className="flex gap-4 ml-6 items-center">
                                {['Current', 'Preferred'].map(loc => (
                                  <label key={loc} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 font-medium">
                                    <input
                                      type="radio"
                                      name="singleLocationType"
                                      value={loc}
                                      checked={singleCandidate.hrScreening.locationType === loc}
                                      onChange={() => handleSingleHrChange('locationType', loc)}
                                    />
                                    {loc === 'Current' ? 'Current Location' : 'Preferred Location'}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="singleAskBond"
                              checked={singleCandidate.hrScreening.askBond}
                              onChange={(e) => handleSingleHrChange('askBond', e.target.checked)}
                              className="w-4 h-4 cursor-pointer"
                            />
                            <label htmlFor="singleAskBond" className="text-xs font-semibold text-slate-700 cursor-pointer">Bond / Notice Period</label>
                          </div>
                        </div>
                      </div>

                      {/* Form submit buttons */}
                      <div className="flex gap-3 mt-4">
                        <Button
                          variant="primary"
                          className="flex-1"
                          onClick={handleGenerateInterviewLink}
                          disabled={inviting}
                          icon={<i className="fas fa-bolt" />}
                        >
                          Generate Interview Link
                        </Button>
                        <Button
                          variant="warning"
                          className="flex-1"
                          onClick={() => handlePreviewEmail('single')}
                          icon={<i className="fas fa-eye" />}
                        >
                          Preview Email
                        </Button>
                      </div>
                    </Card>

                    {/* Created Links Section */}
                    <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                      <div className="flex gap-3 items-center">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/8 text-emerald-500">
                          <i className="fas fa-link text-lg"></i>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-800">Generated Links</h3>
                          <p className="text-xs text-slate-500">Share these with candidates to start interviews</p>
                        </div>
                      </div>

                      {singleCreatedLinks.length === 0 ? (
                        <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                          <i className="fas fa-inbox text-2xl mb-1.5 opacity-50 block"></i>
                          <p>No interview links generated yet in this session.</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {singleCreatedLinks.map((link, idx) => (
                            <div key={idx} className="flex justify-between items-center flex-wrap gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                              <div>
                                <strong className="text-sm text-slate-800 block">{link.name}</strong>
                                <span className="text-xs text-slate-500">{link.email}</span>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  className="px-3.5 py-1.5 text-xs h-[32px] border-slate-200"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/interview?session_id=${link.id}`)
                                    alert("Copied link to clipboard!")
                                  }}
                                >
                                  Copy Link
                                </Button>
                                <a
                                  href={`/interview?session_id=${link.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-full border border-transparent shadow-[0_2px_8px_rgba(99,102,241,0.1)] hover:-translate-y-0.5 transition-all text-center flex items-center justify-center text-white no-underline leading-none"
                                >
                                  Start Interview
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  </div>
                )}

                {/* Bulk send panel */}
                {createTab === 'bulk' && (
                  <div className="flex flex-col gap-6">
                    <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                      <div className="flex gap-3 items-center">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/8 text-primary">
                          <i className="fas fa-users text-lg"></i>
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-800">Bulk Send Interviews</h3>
                          <p className="text-xs text-slate-500">
                            Send interview links to multiple candidates at once
                            <span className="text-warning ml-2 font-semibold text-[0.7rem] bg-warning/8 px-2 py-0.5 rounded">
                              <i className="fas fa-clock mr-1"></i> Valid 24 hours each
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Job Description (Bulk) */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">Job Description <span className="text-rose-500">*</span></label>
                          <button
                            type="button"
                            onClick={() => document.getElementById('bulkJdInput').click()}
                            className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-primary bg-transparent border border-primary/20 rounded px-2.5 py-1 cursor-pointer hover:bg-primary/5 transition-all"
                          >
                            <i className="fas fa-paperclip"></i> Upload
                          </button>
                          <input
                            type="file"
                            id="bulkJdInput"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) return
                              handleParseFile(file, (err, data) => {
                                if (err) {
                                  alert(err)
                                  setBulkJdParsing(false)
                                } else {
                                  handleBulkConfigChange('jobDescription', data.text || '')
                                }
                              }, setBulkJdParsing)
                            }}
                          />
                        </div>
                        {jdParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing Job Description...</span>}
                        <Textarea
                          placeholder="Paste the job description used for ALL candidates or upload a file above..."
                          value={bulkConfig.jobDescription}
                          onChange={(e) => handleBulkConfigChange('jobDescription', e.target.value)}
                        />
                      </div>

                      {/* Custom Questions (Bulk) */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">Custom Questions <span className="text-slate-400 font-normal lowercase">(Optional)</span></label>
                          <button
                            type="button"
                            onClick={() => document.getElementById('bulkCustomInput').click()}
                            className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-primary bg-transparent border border-primary/20 rounded px-2.5 py-1 cursor-pointer hover:bg-primary/5 transition-all"
                          >
                            <i className="fas fa-paperclip"></i> Upload
                          </button>
                          <input
                            type="file"
                            id="bulkCustomInput"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) return
                              handleParseFile(file, (err, data) => {
                                if (err) {
                                  alert(err)
                                  setBulkCustomQuestionsParsing(false)
                                } else {
                                  handleBulkConfigChange('customQuestions', data.text || '')
                                }
                              }, setBulkCustomQuestionsParsing)
                            }}
                          />
                        </div>
                        {customQuestionsParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing file...</span>}
                        <Textarea
                          placeholder="Enter your custom questions here or upload a file. If provided, the AI will ask these first."
                          value={bulkConfig.customQuestions}
                          onChange={(e) => handleBulkConfigChange('customQuestions', e.target.value)}
                        />
                      </div>

                      {/* AI Instructions (Bulk) */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">AI Interview Instructions <span className="text-slate-400 font-normal lowercase">(Optional)</span></label>
                          <button
                            type="button"
                            onClick={() => document.getElementById('bulkAiInstructionsInput').click()}
                            className="inline-flex items-center gap-1 text-[0.7rem] font-bold text-primary bg-transparent border border-primary/20 rounded px-2.5 py-1 cursor-pointer hover:bg-primary/5 transition-all"
                          >
                            <i className="fas fa-paperclip"></i> Upload
                          </button>
                          <input
                            type="file"
                            id="bulkAiInstructionsInput"
                            accept=".pdf,.docx,.doc,.txt"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files[0]
                              if (!file) return
                              handleParseFile(file, (err, data) => {
                                if (err) {
                                  alert(err)
                                  setBulkAiInstructionsParsing(false)
                                } else {
                                  handleBulkConfigChange('aiInstructions', data.text || '')
                                }
                              }, setBulkAiInstructionsParsing)
                            }}
                          />
                        </div>
                        {aiInstructionsParsing && <span className="text-xs text-warning font-semibold mt-1">Parsing file...</span>}
                        <Textarea
                          placeholder="e.g. 'Focus heavily on system design and React performance optimization. Keep questions technical.'"
                          value={bulkConfig.aiInstructions}
                          onChange={(e) => handleBulkConfigChange('aiInstructions', e.target.value)}
                        />
                      </div>

                      {/* Selector Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Select
                          label="Industry Type"
                          value={bulkConfig.industry}
                          onChange={(e) => handleBulkConfigChange('industry', e.target.value)}
                          options={[
                            { value: 'General', label: 'General (No Specific Industry)' },
                            { value: 'Information Technology', label: 'Information Technology' },
                            { value: 'Software & SaaS', label: 'Software & SaaS' },
                            { value: 'Healthcare', label: 'Healthcare' },
                            { value: 'Financial Services', label: 'Financial Services' },
                            { value: 'Education', label: 'Education' },
                            { value: 'Human Resources & Staffing', label: 'Human Resources & Staffing' }
                          ]}
                        />

                        <Select
                          label="Interview Type"
                          value={bulkConfig.interviewType}
                          onChange={(e) => {
                            const type = e.target.value
                            handleBulkConfigChange('interviewType', type)
                            if (type === 'Technical' && bulkConfig.language !== 'English') {
                              alert("Coding round is currently restricted to English language interviews. Switching language to English.")
                              handleBulkConfigChange('language', 'English')
                            }
                          }}
                          options={[
                            { value: 'Technical', label: 'Technical (Includes Coding Round)' },
                            { value: 'Normal', label: 'Normal (Standard AI, No Coding)' },
                            { value: 'Non-Technical', label: 'Non-Technical (Scenario/Case Studies)' }
                          ]}
                        />

                        <Select
                          label="Interview Language"
                          value={bulkConfig.language}
                          onChange={(e) => {
                            const lang = e.target.value
                            handleBulkConfigChange('language', lang)
                            if (lang !== 'English' && bulkConfig.interviewType === 'Technical') {
                              alert("Coding round is currently restricted to English language interviews. Switching to Normal interview type.")
                              handleBulkConfigChange('interviewType', 'Normal')
                            }
                          }}
                          options={['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam', 'Kannada']}
                        />

                        <Input
                          label="Duration (Minutes)"
                          type="number"
                          min="5"
                          max="120"
                          value={bulkConfig.duration}
                          onChange={(e) => {
                            let val = parseInt(e.target.value) || 30
                            if (val > 120) val = 120
                            handleBulkConfigChange('duration', val)
                          }}
                        />
                      </div>

                      {bulkConfig.interviewType === 'Non-Technical' && (
                        <Select
                          label="Number of Case Study Questions (Round 2)"
                          value={bulkConfig.caseStudyCount}
                          onChange={(e) => handleBulkConfigChange('caseStudyCount', parseInt(e.target.value))}
                          options={[
                            { value: '2', label: '2 Questions' },
                            { value: '3', label: '3 Questions' },
                            { value: '4', label: '4 Questions' },
                            { value: '5', label: '5 Questions' }
                          ]}
                        />
                      )}

                      {/* Scheduling Picker (Bulk) */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <i className="fas fa-calendar-check text-primary"></i> Schedule Interview (Optional)
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <Input
                            label="Start Date & Time"
                            type="datetime-local"
                            value={bulkConfig.scheduledStart}
                            onChange={(e) => handleBulkConfigChange('scheduledStart', e.target.value)}
                          />
                          <Input
                            label="End Date & Time"
                            type="datetime-local"
                            value={bulkConfig.scheduledEnd}
                            onChange={(e) => handleBulkConfigChange('scheduledEnd', e.target.value)}
                          />
                        </div>
                        <p className="text-[0.7rem] text-slate-500 leading-normal">
                          <i className="fas fa-info-circle mr-1"></i> Leave empty for immediate access (24h expiry).
                        </p>
                      </div>

                      {/* Record Video Checkbox */}
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="checkbox"
                          id="bulkRecordVideo"
                          checked={bulkConfig.recordVideo}
                          onChange={(e) => handleBulkConfigChange('recordVideo', e.target.checked)}
                          className="w-4 h-4 cursor-pointer"
                        />
                        <label htmlFor="bulkRecordVideo" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                          Record Interview Video (default for all)
                        </label>
                      </div>

                      {/* HR screening options (Bulk) */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                        <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <i className="fas fa-clipboard-check text-primary"></i> HR Screening Questions (Optional)
                        </label>
                        <p className="text-[0.72rem] text-slate-500 leading-normal">
                          AI will ask additional screening questions at the end of each interview.
                        </p>

                        <div className="flex flex-col gap-3 mt-1">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="bulkAskWorkMode"
                                checked={bulkConfig.hrScreening.askWorkMode}
                                onChange={(e) => handleBulkHrChange('askWorkMode', e.target.checked)}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <label htmlFor="bulkAskWorkMode" className="text-xs font-semibold text-slate-700 cursor-pointer">Work Mode</label>
                            </div>
                            {bulkConfig.hrScreening.askWorkMode && (
                              <div className="flex gap-4 ml-6 items-center">
                                {['On-site', 'Remote', 'Hybrid'].map(mode => (
                                  <label key={mode} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 font-medium">
                                    <input
                                      type="radio"
                                      name="bulkWorkModeType"
                                      value={mode}
                                      checked={bulkConfig.hrScreening.workModeType === mode}
                                      onChange={() => handleBulkHrChange('workModeType', mode)}
                                    />
                                    {mode}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id="bulkAskLocation"
                                checked={bulkConfig.hrScreening.askLocation}
                                onChange={(e) => handleBulkHrChange('askLocation', e.target.checked)}
                                className="w-4 h-4 cursor-pointer"
                              />
                              <label htmlFor="bulkAskLocation" className="text-xs font-semibold text-slate-700 cursor-pointer">Location</label>
                            </div>
                            {bulkConfig.hrScreening.askLocation && (
                              <div className="flex gap-4 ml-6 items-center">
                                {['Current', 'Preferred'].map(loc => (
                                  <label key={loc} className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-600 font-medium">
                                    <input
                                      type="radio"
                                      name="bulkLocationType"
                                      value={loc}
                                      checked={bulkConfig.hrScreening.locationType === loc}
                                      onChange={() => handleBulkHrChange('locationType', loc)}
                                    />
                                    {loc === 'Current' ? 'Current Location' : 'Preferred Location'}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="bulkAskBond"
                              checked={bulkConfig.hrScreening.askBond}
                              onChange={(e) => handleBulkHrChange('askBond', e.target.checked)}
                              className="w-4 h-4 cursor-pointer"
                            />
                            <label htmlFor="bulkAskBond" className="text-xs font-semibold text-slate-700 cursor-pointer">Bond / Notice Period</label>
                          </div>
                        </div>
                      </div>

                      {/* File Upload: Excel + CSV */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 m-0">Upload Excel or CSV (.xlsx, .xls, .csv)</label>
                          <button
                            type="button"
                            onClick={downloadExcelTemplate}
                            className="flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/20 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                          >
                            <i className="fas fa-download"></i> Template
                          </button>
                        </div>

                        <div
                          className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-center cursor-pointer bg-white hover:bg-slate-50 hover:border-primary transition-all"
                          onClick={() => document.getElementById('bulkExcelInput').click()}
                        >
                          <p className="font-semibold text-slate-600 text-xs">{bulkCsvLabel}</p>
                        </div>
                        <input
                          type="file"
                          id="bulkExcelInput"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          onChange={handleBulkFileUpload}
                        />
                      </div>

                      {/* Manual Candidates Addition */}
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <Input
                          label="Candidate Name"
                          placeholder="John Doe"
                          value={bulkCandidateInput.name}
                          onChange={(e) => setBulkCandidateInput(prev => ({ ...prev, name: e.target.value }))}
                        />
                        <Input
                          label="Candidate Email"
                          placeholder="john@example.com"
                          value={bulkCandidateInput.email}
                          onChange={(e) => setBulkCandidateInput(prev => ({ ...prev, email: e.target.value }))}
                        />
                        <Button
                          type="button"
                          variant="primary"
                          className="px-5 py-2.5 h-[42px] rounded-lg font-bold"
                          onClick={() => {
                            const { name, email } = bulkCandidateInput
                            if (!name || !email) {
                              alert("Name and email are required to add a candidate manually.")
                              return
                            }
                            if (!email.includes('@')) {
                              alert("Invalid candidate email format.")
                              return
                            }
                            if (bulkCandidates.find(c => c.email === email)) {
                              alert("Candidate already exists in the list.")
                              return
                            }
                            setBulkCandidates(prev => [...prev, { name, email, record_video: true }])
                            setBulkCandidateInput({ name: '', email: '' })
                          }}
                        >
                          Add Candidate
                        </Button>
                      </div>

                      {/* Added Candidates Table */}
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-slate-800">
                            Candidates List (<strong className="text-primary">{bulkCandidates.length}</strong>)
                          </h4>
                          {bulkCandidates.length > 0 && (
                            <button
                              type="button"
                              className="bg-transparent border-none text-rose-500 hover:text-rose-600 text-xs cursor-pointer font-semibold"
                              onClick={() => setBulkCandidates([])}
                            >
                              Clear List
                            </button>
                          )}
                        </div>

                        {bulkCandidates.length === 0 ? (
                          <div className="p-6 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs font-semibold">
                            No candidates added yet. Upload Excel/CSV template or add manually.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl">
                            <table className="w-full border-collapse bg-white text-left">
                              <thead>
                                <tr className="bg-slate-50 border-b border-[#e2e8f0]">
                                  <th className="py-2.5 px-4 font-semibold text-xs text-slate-500">Candidate Name</th>
                                  <th className="py-2.5 px-4 font-semibold text-xs text-slate-500">Email Address</th>
                                  <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 w-[120px]">Record Video</th>
                                  <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 w-[60px] text-center">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {bulkCandidates.map((c, i) => (
                                  <tr key={i} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2 text-xs font-bold text-slate-700">{c.name}</td>
                                    <td className="px-4 py-2 text-xs text-slate-600">{c.email}</td>
                                    <td className="px-4 py-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={c.record_video}
                                        onChange={(e) => {
                                          const copy = [...bulkCandidates]
                                          copy[i].record_video = e.target.checked
                                          setBulkCandidates(copy)
                                        }}
                                        className="w-4 h-4 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-4 py-2 text-xs text-center">
                                      <button
                                        type="button"
                                        className="bg-transparent border-none text-rose-500 hover:text-rose-600 cursor-pointer"
                                        onClick={() => setBulkCandidates(prev => prev.filter((_, idx) => idx !== i))}
                                      >
                                        <i className="fas fa-trash"></i>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Bulk Action Buttons */}
                      <div className="flex gap-3 mt-4">
                        <Button
                          variant="primary"
                          className="flex-1"
                          onClick={handleSendBulkInterviews}
                          disabled={inviting}
                          icon={<i className="fas fa-paper-plane" />}
                        >
                          Send to All Candidates
                        </Button>
                        <Button
                          variant="warning"
                          className="flex-1"
                          onClick={() => handlePreviewEmail('bulk')}
                          icon={<i className="fas fa-eye" />}
                        >
                          Preview Email
                        </Button>
                      </div>
                    </Card>
                  </div>
                )}

              </div>
            )}

            {/* TAB: PROFILE SETTINGS */}
            {activeTab === 'settings' && (
              <ProfileSettings adminUser={adminUser} />
            )}            </>
        )}
      </AdminLayout>

      <RequestCreditsModal
        isOpen={showRequestCreditsModal}
        onClose={() => setShowRequestCreditsModal(false)}
        creditsToRequest={creditsToRequest}
        setCreditsToRequest={setCreditsToRequest}
        handleRequestCredits={handleRequestCredits}
        isRequesting={isRequesting}
      />

      <UpgradePlansModal
        isOpen={showUpgradePlansModal}
        onClose={() => setShowUpgradePlansModal(false)}
        handleSelectPlan={handleSelectPlan}
        isProcessing={isProcessingUpgrade}
      />

      <CandidateScorecardModal
        isOpen={!!selectedCandidate}
        onClose={() => setSelectedCandidate(null)}
        selectedCandidate={selectedCandidate}
        loadingDetail={loadingDetail}
        candidateDetail={candidateDetail}
        handleUpdateDecision={handleUpdateDecision}
      />

      <EmailPreviewModal
        isOpen={emailPreviewModalOpen}
        onClose={() => setEmailPreviewModalOpen(false)}
        emailTemplate={emailTemplate}
        setEmailTemplate={setEmailTemplate}
        buildEmailHtml={buildEmailHtml}
        handleResetEmailPreview={handleResetEmailPreview}
        handleSaveEmailPreview={handleSaveEmailPreview}
      />

      <BulkResultsModal
        isOpen={bulkResultsModalOpen}
        onClose={() => setBulkResultsModalOpen(false)}
        bulkResultsData={bulkResultsData}
      />

      <LiveResultsModal
        isOpen={liveResultsModalOpen}
        onClose={() => setLiveResultsModalOpen(false)}
        ongoingLiveCount={ongoingLiveCount}
        ongoingAlertCount={ongoingAlertCount}
        ongoingSpeakingCount={ongoingSpeakingCount}
        ongoingCodingCount={ongoingCodingCount}
        liveSessions={liveSessions}
        handleOpenScorecard={handleOpenScorecard}
      />
    </>
  )
}
