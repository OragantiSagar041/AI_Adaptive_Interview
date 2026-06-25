import React, { useState, useEffect } from 'react'
import { useNavigate, Navigate, useSearchParams, useLocation, Outlet } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { RefreshCw } from 'lucide-react'
import axios from 'axios'
import AdminLayout from '../components/admin/AdminLayout'
import ProfileSettings from '../components/admin/ProfileSettings'
import { CandidateScorecardModal, LiveResultsModal, RequestCreditsModal, UpgradePlansModal } from '../components/admin/modals/AdminModals'
import LiveMonitorStreamModal from '../components/admin/modals/LiveMonitorStreamModal'
import { getComputedStatus } from '../utils/adminFormatters'

import OverviewDashboardPage from './admin/OverviewDashboardPage'
import QualifiedCandidatesPage from './admin/QualifiedCandidatesPage'
import RejectedCandidatesPage from './admin/RejectedCandidatesPage'
import CreateInterviewPage from './admin/CreateInterviewPage'

import { logout, updateCredits } from '../store/slices/authSlice'
import { persistor } from '../store/store'
import { loadDashboardData } from '../store/slices/dashboardSlice'
import {
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setSelectedIds,
  setCurrentPage,
  handleExportExcel,
  handleBulkDelete
} from '../store/slices/candidatesSlice'
import {
  setLiveResultsModalOpen,
  setSelectedCandidate,
  handleOpenScorecard,
  handleDeleteSession as deleteSessionThunk,
  handleUpdateDecision
} from '../store/slices/interviewSlice'
import { handleUpdateCreditRequest } from '../store/slices/creditsSlice'

const getFilteredCandidates = (candidatesState) => {
  const { candidates, searchTerm, statusFilter, startDate, endDate, sortBy } = candidatesState
  const filtered = candidates.filter(c => {
    const name = (c.candidate_name || '').toLowerCase()
    const email = (c.candidate_email || '').toLowerCase()
    const position = (c.interview_title || '').toLowerCase()
    const query = searchTerm.toLowerCase()

    const matchesSearch = name.includes(query) || email.includes(query) || position.includes(query)
    if (!matchesSearch) return false

    const computedStatus = getComputedStatus(c)
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        if (computedStatus !== 'pending' && computedStatus !== 'started') return false
      } else if (computedStatus !== statusFilter) {
        return false
      }
    }

    const createdDate = new Date(c.created_at)
    if (startDate && createdDate < new Date(startDate)) return false
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      if (createdDate > endDateTime) return false
    }

    return true
  })

  return [...filtered].sort((a, b) => {
    if (sortBy === 'score') {
      return Number(b.score || 0) - Number(a.score || 0)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export default function AdminPage({ role: initialRole = 'admin' }) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { pathname } = useLocation()

  // Auth selectors
  const token = useSelector(state => state.auth.token)
  const adminUser = useSelector(state => state.auth.adminUser)
  const role = useSelector(state => state.auth.role) || initialRole
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Dashboard selectors
  const dbStats = useSelector(state => state.dashboard.dbStats)
  const ongoingLiveCount = useSelector(state => state.dashboard.ongoingLiveCount)
  const ongoingAlertCount = useSelector(state => state.dashboard.ongoingAlertCount)
  const ongoingSpeakingCount = useSelector(state => state.dashboard.ongoingSpeakingCount)
  const ongoingCodingCount = useSelector(state => state.dashboard.ongoingCodingCount)
  const ongoingMonitoredCount = useSelector(state => state.dashboard.ongoingMonitoredCount)
  const liveSessions = useSelector(state => state.dashboard.liveSessions)
  const dashboardStatus = useSelector(state => state.dashboard.status)
  const loadingData = dashboardStatus === 'loading'

  // Candidates selectors
  const candidates = useSelector(state => state.candidates.candidates)
  const paginatedCandidates = useSelector(state => state.candidates.paginatedCandidates)
  const selectedIds = useSelector(state => state.candidates.selectedIds)
  const searchTerm = useSelector(state => state.candidates.searchTerm)
  const startDate = useSelector(state => state.candidates.startDate)
  const endDate = useSelector(state => state.candidates.endDate)
  const statusFilter = useSelector(state => state.candidates.statusFilter)
  const sortBy = useSelector(state => state.candidates.sortBy)
  const totalPages = useSelector(state => state.candidates.totalPages)
  const startIndex = useSelector(state => state.candidates.startIndex)
  const endIndex = useSelector(state => state.candidates.endIndex)
  const totalItems = useSelector(state => state.candidates.totalItems)
  const currentPage = useSelector(state => state.candidates.currentPage)

  // Interview selectors
  const liveResultsModalOpen = useSelector(state => state.interview.liveResultsModalOpen)
  const selectedCandidate = useSelector(state => state.interview.selectedCandidate)
  const candidateDetail = useSelector(state => state.interview.candidateDetail)
  const loadingDetail = useSelector(state => state.interview.loadingDetail)

  // Credits selectors
  const creditRequests = useSelector(state => state.credits.creditRequests)

  // Sub-admins and dropdown filter states (Local component states are fine)
  const [subAdmins, setSubAdmins] = useState([])
  const [selectedAdminId, setSelectedAdminId] = useState('')

  useEffect(() => {
    if (role === 'superadmin') {
      const fetchSubAdmins = async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/super-admin/admins`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          setSubAdmins(res.data.data || [])
        } catch (err) {
          console.error("Error fetching sub-admins:", err)
        }
      }
      fetchSubAdmins()
    }
  }, [role, token, API_BASE_URL])

  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')

  // Derive activeTab from path or search params
  let activeTab = 'dashboard'
  if (role === 'superadmin') {
    activeTab = tabParam || 'dashboard'
  } else {
    if (pathname.includes('qualified-candidates')) {
      activeTab = 'qualified'
    } else if (pathname.includes('rejected-candidates')) {
      activeTab = 'rejected'
    } else if (pathname.includes('create-interview')) {
      activeTab = 'create'
    } else if (pathname.includes('profile-settings')) {
      activeTab = 'settings'
    }
  }

  // Keep liveResultsModal sync with searchParam
  useEffect(() => {
    if (tabParam === 'live') {
      dispatch(setLiveResultsModalOpen(true))
    }
  }, [tabParam, dispatch])

  // Accent color state
  const [accentName, setAccentName] = useState('indigo')

  // Live Stream WebRTC State
  const [isLiveStreamOpen, setIsLiveStreamOpen] = useState(false)
  const [liveStreamSession, setLiveStreamSession] = useState(null)

  const handleOpenLiveStreamAction = (session) => {
    setLiveStreamSession(session)
    setIsLiveStreamOpen(true)
  }

  // Credit / Razorpay states
  const [showRequestCreditsModal, setShowRequestCreditsModal] = useState(false)
  const [creditsToRequest, setCreditsToRequest] = useState(100)
  const [isRequesting, setIsRequesting] = useState(false)
  const [showUpgradePlansModal, setShowUpgradePlansModal] = useState(false)
  const [processingPlanId, setProcessingPlanId] = useState(null)
  const [subscriptionPlans, setSubscriptionPlans] = useState([])

  // Invite candidate state
  const [inviteInterviewId, setInviteInterviewId] = useState(null)
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' })
  const [inviting, setInviting] = useState(false)

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

  const accentColors = {
    teal: { primary: '#0d9488', hover: '#0f766e', glow: 'rgba(13, 148, 136, 0.15)' },
    indigo: { primary: '#6366f1', hover: '#4f46e5', glow: 'rgba(99, 102, 241, 0.15)' },
    purple: { primary: '#9333ea', hover: '#7e22ce', glow: 'rgba(147, 51, 234, 0.15)' },
    red: { primary: '#e11d48', hover: '#be123c', glow: 'rgba(225, 29, 72, 0.15)' },
    green: { primary: '#16a34a', hover: '#15803d', glow: 'rgba(22, 163, 74, 0.15)' },
    blue: { primary: '#2563eb', hover: '#1d4ed8', glow: 'rgba(37, 99, 237, 0.15)' }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo

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

    dispatch(loadDashboardData(selectedAdminId))
    const statsInterval = setInterval(() => {
      dispatch(loadDashboardData(selectedAdminId))
    }, 12000)

    return () => clearInterval(statsInterval)
  }, [dispatch, token, selectedAdminId])

  useEffect(() => {
    if (!token || (adminUser?.role !== 'superadmin' && role !== 'superadmin')) return

    const fetchSubscriptionPlans = async () => {
      try {
        const plansRes = await fetch(`${API_BASE_URL}/api/plans`)
        if (plansRes.ok) {
          const plansData = await plansRes.json()
          const normalizedPlans = (plansData.data || []).map(p => ({
            id: p.id,
            name: p.plan_name,
            price: p.price * 100, // convert Rupees to Paise since UpgradePlansModal divides it by 105!
            credits: p.credits ?? p.credits_granted ?? 0,
            summary: p.summary || `Upgrade to ${p.plan_name} to get ${p.credits ?? p.credits_granted ?? 0} credits.`,
            features: p.features || []
          }))
          setSubscriptionPlans(normalizedPlans)
        }
      } catch (e) {
        console.error(e)
      }
    }

    fetchSubscriptionPlans()
  }, [token, adminUser, role, API_BASE_URL])

  const refreshDashboardData = () => dispatch(loadDashboardData(selectedAdminId))

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

        refreshDashboardData()
        dispatch(updateCredits((adminUser?.credits || 0) - 1))
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
        refreshDashboardData()
        dispatch(updateCredits((adminUser?.credits || 0) - (data.successful || 0)))
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
      await axios.post(`${API_BASE_URL}/admin/credit-requests`, {
        requested_amount: parseInt(creditsToRequest)
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      alert("Credit request sent successfully!");
      setShowRequestCreditsModal(false);
    } catch (e) {
      console.error(e);
      alert("Failed to send credit request.");
    } finally {
      setIsRequesting(false);
    }
  }

  const handleUpdateCreditRequestAction = (requestId, status) => {
    dispatch(handleUpdateCreditRequest({ requestId, status }))
  }

  const handleSelectPlan = async (plan) => {
    if (processingPlanId) return;

    if (!window.Razorpay) {
      alert("Razorpay Checkout could not be loaded. Please check your internet connection and try again.");
      return;
    }

    setProcessingPlanId(plan.id)
    try {
      // Dynamic key resolution: query registration order endpoint with randomized email to get actual key
      let dynamicKey = 'rzp_test_SgtZz5GYGtOM5F'; // fallback key from backend .env
      try {
        const keyRes = await axios.post(`${API_BASE_URL}/api/razorpay/create-order`, {
          plan_name: plan.name,
          signup_form: {
            name: 'Temp Key Fetcher',
            email: `temp_key_fetch_${Date.now()}_${Math.round(Math.random() * 100000)}@dummy.com`,
            password: 'TemporaryPassword123!',
            phone: '1234567890',
            company_name: 'Temp Company'
          }
        });
        if (keyRes.data && keyRes.data.key) {
          dynamicKey = keyRes.data.key;
        }
      } catch (keyError) {
        console.warn("Could not fetch Razorpay key dynamically, using local fallback:", keyError);
      }

      // Call endpoint to create upgrade/buy credits order
      const orderRes = await axios.post(`${API_BASE_URL}/api/razorpay/create-upgrade-order`, {
        plan_name: plan.name,
        admin_id: adminUser?.id || adminUser?._id || '',
        amount_inr: plan.price / 100,
        credits: plan.credits
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const orderData = orderRes.data;
      const isMock = !orderData.key_id && !orderData.key;

      const storedUser = (() => {
        try {
          return JSON.parse(sessionStorage.getItem('adminUser')) || {};
        } catch {
          return {};
        }
      })();

      const userEmail = adminUser?.email || storedUser?.email || '';
      const userName = adminUser?.name || storedUser?.name || 'Super Admin';
      const userPhone = adminUser?.phone || storedUser?.phone || '';

      const options = {
        key: orderData.key_id || orderData.key || dynamicKey,
        amount: plan.price,
        currency: 'INR',
        name: 'Hire IQ Credits',
        description: `Purchase ${plan.credits} Credits`,
        prefill: {
          name: userName,
          email: userEmail,
          contact: userPhone
        },
        theme: { color: '#6366f1' },
        handler: async function (response) {
          try {
            await axios.post(`${API_BASE_URL}/api/razorpay/verify-upgrade`, {
              plan_name: plan.name,
              admin_id: adminUser?.id || adminUser?._id || '',
              razorpay_order_id: response.razorpay_order_id || orderData.razorpay_order_id || '',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature || 'mock_signature'
            }, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            alert("Credits added successfully!")
            setShowUpgradePlansModal(false)
            window.location.reload()
          } catch (e) {
            alert("Payment verification failed")
          }
        },
        modal: {
          ondismiss: function () {
            setProcessingPlanId(null)
          }
        }
      };

      if (!isMock) {
        options.order_id = orderData.razorpay_order_id;
      }

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert(e.message)
    } finally {
      setProcessingPlanId(null)
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    dispatch(logout())
    persistor.purge()
    navigate('/login')
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
        refreshDashboardData()
      } else {
        alert(payload.detail || payload.message || "Failed to generate link.")
      }
    } catch (e) {
      console.error(e)
    } finally {
      setInviting(false)
    }
  }

  const handleDeleteSessionAction = async (linkId) => {
    if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return
    dispatch(deleteSessionThunk(linkId))
  }

  const handleBulkDeleteAction = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected sessions? This cannot be undone.`)) return
    dispatch(handleBulkDelete(selectedIds))
  }

  const handleOpenScorecardAction = (candidate) => {
    dispatch(handleOpenScorecard(candidate))
  }

  const handleUpdateDecisionAction = (linkId, decision) => {
    if (!confirm(`Are you sure you want to mark this candidate as ${decision.toUpperCase()}? Official email will be sent.`)) return
    dispatch(handleUpdateDecision({ linkId, decision }))
  }

  const handleExportExcelAction = () => {
    const filtered = getFilteredCandidates({ candidates, searchTerm, statusFilter, startDate, endDate, sortBy })
    if (filtered.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleExportExcel(filtered.map(c => ({
      ...c,
      status: getComputedStatus(c)
    }))))
  }

  if (!token) {
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

  // To preserve sub-components backwards-compatibility, we can pass down sharedContext
  const sharedContext = {
    role,
    token,
    adminUser,
    candidates,
    loadingData,
    loadDashboardData: refreshDashboardData,
    handleExportExcel: handleExportExcelAction,
    handleDeleteSession: handleDeleteSessionAction,
    handleBulkDelete: handleBulkDeleteAction,
    handleUpdateDecision: handleUpdateDecisionAction,
    handleUpdateCreditRequest: handleUpdateCreditRequestAction,
    handleOpenScorecard: handleOpenScorecardAction,
    selectedCandidate,
    setSelectedCandidate: (c) => dispatch(setSelectedCandidate(c)),
    candidateDetail,
    loadingDetail,
    dbStats,
    ongoingLiveCount,
    ongoingAlertCount,
    ongoingSpeakingCount,
    ongoingCodingCount,
    ongoingMonitoredCount,
    setLiveResultsModalOpen: (isOpen) => dispatch(setLiveResultsModalOpen(isOpen)),
    searchTerm,
    setSearchTerm: (term) => dispatch(setSearchTerm(term)),
    startDate,
    setStartDate: (date) => dispatch(setStartDate(date)),
    endDate,
    setEndDate: (date) => dispatch(setEndDate(date)),
    statusFilter,
    setStatusFilter: (filter) => dispatch(setStatusFilter(filter)),
    sortBy,
    setSortBy: (sort) => dispatch(setSortBy(sort)),
    selectedIds,
    setSelectedIds: (ids) => dispatch(setSelectedIds(ids)),
    currentPage,
    setCurrentPage: (page) => dispatch(setCurrentPage(page)),
    creditRequests,
    API_BASE_URL,
    totalPages,
    startIndex,
    endIndex,
    totalItems,
    paginatedCandidates,
    getComputedStatus
  }

  const renderContent = () => {
    if (role === 'superadmin') {
      switch (activeTab) {
        case 'dashboard':
          return <OverviewDashboardPage {...sharedContext} />
        case 'qualified':
          return <QualifiedCandidatesPage {...sharedContext} />
        case 'rejected':
          return <RejectedCandidatesPage {...sharedContext} />
        case 'create':
          return <CreateInterviewPage {...sharedContext} />
        case 'settings':
          return <ProfileSettings {...sharedContext} />
        default:
          return <OverviewDashboardPage {...sharedContext} />
      }
    }
    return <Outlet context={sharedContext} />
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
            dispatch(setLiveResultsModalOpen(true))
          } else {
            if (role === 'superadmin') {
              navigate(`/super-admin?tab=${tab}`)
            } else {
              const tabToPath = {
                dashboard: '/admin/dashboard',
                qualified: '/admin/qualified-candidates',
                rejected: '/admin/rejected-candidates',
                create: '/admin/create-interview',
                settings: '/admin/profile-settings'
              }
              navigate(tabToPath[tab] || '/admin/dashboard')
            }
          }
        }}
      >
        {loadingData && candidates.length === 0 ? (
          <div className="flex items-center gap-2.5 text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            <span>Refreshing console workspace...</span>
          </div>
        ) : (
          <>
            {renderAdminSelector()}
            {renderContent()}
          </>
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
        isProcessing={processingPlanId}
        plans={subscriptionPlans}
      />

      <CandidateScorecardModal
        isOpen={!!selectedCandidate}
        onClose={() => dispatch(setSelectedCandidate(null))}
        selectedCandidate={selectedCandidate}
        loadingDetail={loadingDetail}
        candidateDetail={candidateDetail}
        handleUpdateDecision={handleUpdateDecisionAction}
      />

      <LiveResultsModal
        isOpen={liveResultsModalOpen}
        onClose={() => dispatch(setLiveResultsModalOpen(false))}
        ongoingLiveCount={ongoingLiveCount}
        ongoingAlertCount={ongoingAlertCount}
        ongoingSpeakingCount={ongoingSpeakingCount}
        ongoingCodingCount={ongoingCodingCount}
        liveSessions={liveSessions}
        handleOpenScorecard={handleOpenScorecardAction}
        handleOpenLiveStream={handleOpenLiveStreamAction}
      />

      <LiveMonitorStreamModal
        isOpen={isLiveStreamOpen}
        onClose={() => {
          setIsLiveStreamOpen(false)
          setLiveStreamSession(null)
        }}
        session={liveStreamSession}
      />
    </>
  )
}
