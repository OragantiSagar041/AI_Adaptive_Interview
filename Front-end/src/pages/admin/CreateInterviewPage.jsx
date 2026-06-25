import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import Swal from 'sweetalert2'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Textarea from '../../components/Textarea'
import Select from '../../components/Select'
import { EmailPreviewModal, BulkResultsModal, convertHtmlToPlainText } from '../../components/admin/modals/AdminModals'
import { loadDashboardData } from '../../store/slices/dashboardSlice'

export default function CreateInterviewPage() {
  const dispatch = useDispatch()
  const token = useSelector(state => state.auth.token)
  const adminUser = useSelector(state => state.auth.adminUser)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Form input states
  const [createTab, setCreateTab] = useState('single') // 'single' | 'bulk'
  const [inviting, setInviting] = useState(false)

  // Collapsible Accordion States
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false)
  const [bulkInstructionsOpen, setBulkInstructionsOpen] = useState(false)

  // Single Candidate Form
  const [singleCandidate, setSingleCandidate] = useState({
    name: '',
    email: '',
    resumeText: '',
    jobDescription: '',
    customQuestions: '',
    aiInstructions: '',
    industry: 'General',
    interviewFormat: 'Standard',
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
    interviewFormat: 'Standard',
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
      const response = await axios.post(`${API_BASE_URL}/admin/parse-resume`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })
      onParsed(null, response.data)
    } catch (error) {
      const detailMsg = error.response?.data?.detail || error.message || "Error parsing file"
      onParsed(detailMsg)
    } finally {
      onLoading(false)
    }
  }

  // Check if candidate already has a profile/resume on file
  const handleCheckCandidate = async (email) => {
    if (!email || !email.includes('@')) return
    try {
      const response = await axios.get(`${API_BASE_URL}/admin/candidate/check?email=${encodeURIComponent(email)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = response.data
      if (data.exists && data.resume_text) {
        const result = await Swal.fire({
          title: 'Candidate Profile Found',
          html: `
            <div class="flex flex-col items-center text-center gap-3 mt-3">
              <div class="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner mb-1">
                <i class="fas fa-user-check text-2xl animate-pulse"></i>
              </div>
              <p class="text-[0.9rem] text-slate-500 leading-relaxed px-1 font-medium">
                An existing profile was found for <strong class="text-indigo-600 font-bold">${email}</strong>. Would you like to automatically fill the name and resume details?
              </p>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: 'Yes, Autofill',
          cancelButtonText: 'No, Keep Blank',
          confirmButtonColor: '#6366f1',
          cancelButtonColor: '#94a3b8',
          customClass: {
            popup: 'rounded-2xl border border-slate-100 shadow-2xl p-6',
            title: 'text-lg font-bold text-slate-800 font-sans tracking-tight pt-2',
            confirmButton: 'px-5 py-2.5 rounded-xl font-semibold text-xs shadow-md transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mr-2',
            cancelButton: 'px-5 py-2.5 rounded-xl font-semibold text-xs shadow-sm transition-all hover:bg-slate-200 focus:outline-none'
          },
          buttonsStyling: true
        })
        if (result.isConfirmed) {
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
    } catch (e) {
      console.error(e)
    }
  }

  // Calculate ATS match score
  const handleCalculateAts = async (resume, jd) => {
    if (!resume || !jd) return
    setAtsCalculating(true)
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/ats-score`, {
        resume_text: resume,
        jd_text: jd
      })
      const data = response.data
      setAtsScoreData({
        score: data.score || 0,
        summary: data.summary || '',
        matched_skills: data.matched_skills || [],
        missing_skills: data.missing_skills || []
      })
    } catch (e) {
      console.error("ATS score error:", e)
      Swal.fire({
        title: 'ATS Calculation Failed',
        text: 'Failed to calculate ATS match score.',
        icon: 'error',
        confirmButtonColor: '#6366f1'
      })
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
      const res = await axios.post(`${API_BASE_URL}/admin/preview-email`, {
        candidate_name: name,
        candidate_email: email,
        job_description: jd,
        interview_duration: Number(duration),
        scheduled_start: toUtcIso(start),
        scheduled_end: toUtcIso(end)
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = res.data

      const parser = new DOMParser()
      const doc = parser.parseFromString(data.html, 'text/html')
      const bodyAttributes = {}
      Array.from(doc.body.attributes).forEach(attr => {
        bodyAttributes[attr.name] = attr.value
      })

      const scheduleParagraphs = Array.from(doc.querySelectorAll('p'))
      const schedulePara = scheduleParagraphs.find(p => p.innerText.includes('Scheduled Time'))
      let scheduleHtml = ''
      if (schedulePara) {
        const nextPara = schedulePara.nextElementSibling
        if (nextPara && (nextPara.innerText.includes('Important:') || nextPara.style.color === 'rgb(239, 68, 68)' || nextPara.innerText.includes('scheduled time window'))) {
          scheduleHtml = schedulePara.outerHTML + '\n' + nextPara.outerHTML
        } else {
          scheduleHtml = schedulePara.outerHTML
        }
      }

      const bodyHtml = doc.body ? doc.body.innerHTML : data.html
      const plainText = convertHtmlToPlainText(bodyHtml, name, jd, duration)

      setEmailTemplate({
        headHtml: doc.head ? doc.head.innerHTML : '',
        bodyAttributes,
        bodyInnerHtml: bodyHtml,
        plainText,
        candidateName: name,
        jobDescription: jd,
        duration: duration,
        scheduleHtml
      })

      setEmailPreviewModalOpen(true)
    } catch (e) {
      Swal.fire({
        title: 'Preview Generation Failed',
        text: 'Could not generate email preview: ' + (e.response?.data?.detail || e.message),
        icon: 'error',
        confirmButtonColor: '#6366f1'
      })
    }
  }

  const handleSaveEmailPreview = () => {
    setCustomEmailHtml(buildEmailHtml())
    setEmailPreviewModalOpen(false)
    Swal.fire({
      title: 'Template Saved',
      text: 'Custom email template saved and will be used for invitations!',
      icon: 'success',
      confirmButtonColor: '#6366f1'
    })
  }

  const handleResetEmailPreview = () => {
    setCustomEmailHtml('')
    setEmailPreviewModalOpen(false)
    Swal.fire({
      title: 'Template Reset',
      text: 'Reset to default invitation email template.',
      icon: 'info',
      confirmButtonColor: '#6366f1'
    })
  }

  // Generate Single Link Session
  const handleGenerateInterviewLink = async () => {
    const { name, email, resumeText, jobDescription, duration, interviewFormat, interviewType, industry, language, caseStudyCount, scheduledStart, scheduledEnd, recordVideo, hrScreening, customQuestions, aiInstructions } = singleCandidate

    if (!name || !email || !resumeText || !jobDescription) {
      Swal.fire({
        title: 'Missing Required Fields',
        text: 'Please fill in all required fields (Name, Email, Resume, Job Description).',
        icon: 'warning',
        confirmButtonColor: '#6366f1'
      })
      return
    }

    if (duration < 5 || duration > 120) {
      Swal.fire({
        title: 'Invalid Duration',
        text: 'Interview Duration must be between 5 and 120 minutes.',
        icon: 'warning',
        confirmButtonColor: '#6366f1'
      })
      return
    }

    const toUtcIso = (val) => {
      if (!val) return ""
      return new Date(val).toISOString()
    }

    setInviting(true)
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/create-session`, {
        candidate_name: name,
        candidate_email: email,
        resume_text: resumeText,
        job_description: jobDescription,
        admin_id: adminUser?.admin_id || 'admin',
        interview_duration: Number(duration),
        interview_format: interviewFormat,
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
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = response.data
      let msg = `Secure interview link created successfully!`
      if (data.email_scheduled && data.email_send_at) {
        msg += `\nInvitation scheduled to send to ${email} at ${new Date(data.email_send_at).toLocaleString()}`
      } else if (data.email_sent) {
        msg += `\nInvitation email sent successfully to ${email}!`
      }

      Swal.fire({
        title: 'Success!',
        text: msg,
        icon: 'success',
        confirmButtonColor: '#6366f1'
      })

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

      dispatch(loadDashboardData())
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Session Creation Failed',
        text: e.response?.data?.detail || e.response?.data?.message || "Failed to create session.",
        icon: 'error',
        confirmButtonColor: '#6366f1'
      })
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
      Swal.fire({
        title: 'Downloaded',
        text: 'Template downloaded successfully!',
        icon: 'success',
        confirmButtonColor: '#10b981'
      })
    } else {
      let csvContent = "data:text/csv;charset=utf-8,Name,Email\nJohn Doe,john@example.com\nJane Smith,jane@example.com"
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", "interview_candidates_template.csv")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      Swal.fire({
        title: 'Downloaded',
        text: 'CSV Template downloaded!',
        icon: 'success',
        confirmButtonColor: '#10b981'
      })
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
          Swal.fire({
            title: 'Import Successful',
            text: `${added} candidates imported successfully!`,
            icon: 'success',
            confirmButtonColor: '#6366f1'
          })
        } catch (err) {
          setBulkCsvLabel('Could not read Excel file')
          Swal.fire({
            title: 'Error Reading Excel',
            text: err.message,
            icon: 'error',
            confirmButtonColor: '#ef4444'
          })
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
          Swal.fire({
            title: 'Import Successful',
            text: `${added} candidates imported successfully!`,
            icon: 'success',
            confirmButtonColor: '#6366f1'
          })
        } catch (err) {
          setBulkCsvLabel('Could not read CSV file')
          Swal.fire({
            title: 'Error Reading CSV',
            text: err.message,
            icon: 'error',
            confirmButtonColor: '#ef4444'
          })
        }
      }
      reader.readAsText(file)
    }
  }

  // Submit bulk invitation sessions
  const handleSendBulkInterviews = async () => {
    const { jobDescription, customQuestions, aiInstructions, industry, interviewFormat, interviewType, language, caseStudyCount, duration, recordVideo, scheduledStart, scheduledEnd, hrScreening } = bulkConfig

    if (!jobDescription) {
      Swal.fire({
        title: 'Missing Requirements',
        text: 'Please enter a Job Description.',
        icon: 'warning',
        confirmButtonColor: '#6366f1'
      })
      return
    }
    if (bulkCandidates.length === 0) {
      Swal.fire({
        title: 'No Candidates Selected',
        text: 'Please add at least one candidate.',
        icon: 'warning',
        confirmButtonColor: '#6366f1'
      })
      return
    }

    const toUtcIso = (val) => {
      if (!val) return ""
      return new Date(val).toISOString()
    }

    setInviting(true)
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/bulk-create-sessions`, {
        candidates: bulkCandidates.map(c => ({
          candidate_name: c.name,
          candidate_email: c.email,
          resume_text: '',
          record_video: c.record_video !== undefined ? c.record_video : recordVideo
        })),
        job_description: jobDescription,
        interview_format: interviewFormat,
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
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      const data = response.data
      Swal.fire({
        title: 'Success!',
        text: `Successfully sent ${data.successful}/${data.total} interviews!`,
        icon: 'success',
        confirmButtonColor: '#6366f1'
      })
      setBulkResultsData(data)
      setBulkResultsModalOpen(true)
      setBulkCandidates([])
      setCustomEmailHtml('')
      dispatch(loadDashboardData())
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Bulk Invitations Failed',
        text: e.response?.data?.detail || e.response?.data?.message || "Error sending bulk interviews.",
        icon: 'error',
        confirmButtonColor: '#ef4444'
      })
    } finally {
      setInviting(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-8">
        {/* Page Header */}
        <div className="flex flex-col gap-1.5 md:flex-row md:justify-between md:items-center bg-white/40 p-6 rounded-2xl border border-slate-200/60 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.02)]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-primary shadow-sm">
              <i className="fas fa-file-signature text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Create Interview Session</h2>
              <p className="text-xs text-slate-500 font-medium">Configure settings, parse resumes, and invite candidates to AI-conducted adaptive interviews.</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher Capsule */}
        <div className="flex bg-slate-100/80 p-1.5 rounded-2xl gap-1.5 max-w-md mx-auto w-full border border-slate-200/50 shadow-sm relative overflow-hidden">
          <button
            type="button"
            onClick={() => setCreateTab('single')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-xs cursor-pointer transition-all duration-300 outline-none flex items-center justify-center gap-2 z-10 ${
              createTab === 'single'
                ? 'bg-primary text-white shadow-[0_4px_12px_rgba(99,102,241,0.25)]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <i className="fas fa-user text-xs"></i> Single Candidate
          </button>
          <button
            type="button"
            onClick={() => setCreateTab('bulk')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-extrabold text-xs cursor-pointer transition-all duration-300 outline-none flex items-center justify-center gap-2 z-10 ${
              createTab === 'bulk'
                ? 'bg-primary text-white shadow-[0_4px_12px_rgba(99,102,241,0.25)]'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
            }`}
          >
            <i className="fas fa-users text-xs"></i> Bulk Send
          </button>
        </div>

        {/* Single candidate panel */}
        {createTab === 'single' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Candidate & Material Details (Col Span 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Card 1: Candidate Basic Info */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-user-tie text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Candidate Information</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Provide basic contact and login credentials</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Candidate Name"
                    placeholder="e.g. John Doe"
                    value={singleCandidate.name}
                    onChange={(e) => handleSingleChange('name', e.target.value)}
                  />

                  <Input
                    label="Candidate Email"
                    type="email"
                    placeholder="e.g. john@example.com"
                    value={singleCandidate.email}
                    onChange={(e) => handleSingleChange('email', e.target.value)}
                    onBlur={() => handleCheckCandidate(singleCandidate.email)}
                  />
                </div>
              </Card>

              {/* Card 2: Resume & Job Requirements */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-file-invoice text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Resume & Job Profile</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Input documents for automated AI assessment</p>
                  </div>
                </div>

                {/* Upload Resume */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Upload Resume (PDF / DOCX / TXT)</label>
                  <div
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-2.5 group relative overflow-hidden ${
                      singleCandidate.resumeText
                        ? 'border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40 shadow-sm shadow-emerald-500/5'
                        : 'border-slate-200 bg-slate-50/40 hover:bg-white hover:border-primary/80 hover:shadow-md hover:shadow-indigo-500/5 hover:-translate-y-0.5'
                    }`}
                    onClick={() => document.getElementById('singleResumeInput').click()}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                      singleCandidate.resumeText
                        ? 'bg-emerald-100 text-emerald-650 animate-[pulse_2s_infinite]'
                        : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 group-hover:scale-110'
                    }`}>
                      <i className={`text-xl ${singleCandidate.resumeText ? 'fas fa-file-circle-check' : 'fas fa-file-arrow-up'}`}></i>
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 text-sm">
                        {singleCandidate.resumeText ? "Resume Loaded & Parsed" : "Click to upload or drag & drop"}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">PDF, DOCX, TXT - Max 5MB</p>
                    </div>
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
                          Swal.fire({
                            title: 'Parsing Failed',
                            text: err,
                            icon: 'error',
                            confirmButtonColor: '#6366f1'
                          })
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
                  {resumeParsing && <span className="text-xs text-warning font-semibold mt-1"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing resume...</span>}
                  {singleCandidate.resumeText && !resumeParsing && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-success font-semibold flex items-center gap-1">
                        <i className="fas fa-check-circle"></i> Parsed successfully
                      </span>
                      <button
                        type="button"
                        className="bg-transparent border-none text-rose-500 text-xs font-semibold cursor-pointer hover:underline flex items-center gap-1"
                        onClick={() => handleSingleChange('resumeText', '')}
                      >
                        <i className="fas fa-trash"></i> Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Job Description */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">Job Description</label>
                    <button
                      type="button"
                      onClick={() => document.getElementById('singleJdInput').click()}
                      className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-3 py-1 cursor-pointer transition-all"
                    >
                      <i className="fas fa-paperclip"></i> Upload file
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
                            Swal.fire({
                              title: 'Parsing Failed',
                              text: err,
                              icon: 'error',
                              confirmButtonColor: '#6366f1'
                            })
                            setJdParsing(false)
                          } else {
                            handleSingleChange('jobDescription', data.text || '')
                          }
                        }, setJdParsing)
                      }}
                    />
                  </div>
                  {jdParsing && <span className="text-xs text-warning font-semibold mt-1"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing Job Description...</span>}
                  <Textarea
                    placeholder="Paste the job description details here, or use the file upload selector above..."
                    value={singleCandidate.jobDescription}
                    onChange={(e) => handleSingleChange('jobDescription', e.target.value)}
                  />
                </div>

                {/* ATS Match Score */}
                {atsScoreData && (
                  <div className="bg-indigo-50/30 border border-indigo-100/80 rounded-2xl p-5 mt-2 flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                        <i className="fas fa-chart-line text-primary"></i> ATS Resume Match Score
                      </h4>
                      <Button
                        onClick={() => handleCalculateAts(singleCandidate.resumeText, singleCandidate.jobDescription)}
                        disabled={atsCalculating}
                        variant="secondary"
                        className="px-3.5 py-1 text-xs h-[30px] rounded-lg bg-white"
                      >
                        {atsCalculating ? "Analyzing..." : <><i className="fas fa-sync-alt mr-1"></i> Recalculate</>}
                      </Button>
                    </div>
                    <div className="flex gap-6 items-start flex-col sm:flex-row">
                      <div className="flex-shrink-0 text-center mx-auto sm:mx-0">
                        <div className="relative w-20 h-20 flex items-center justify-center">
                          <svg className="w-20 h-20 transform -rotate-90">
                            <defs>
                              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#4f46e5" />
                              </linearGradient>
                            </defs>
                            <circle cx="40" cy="40" r="34" stroke="#e2e8f0" strokeWidth="6" fill="transparent" />
                            <circle
                              cx="40"
                              cy="40"
                              r="34"
                              stroke={atsScoreData.score >= 75 ? '#10b981' : atsScoreData.score >= 50 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="6"
                              fill="transparent"
                              strokeDasharray={213.6}
                              strokeDashoffset={213.6 - (213.6 * atsScoreData.score) / 100}
                              strokeLinecap="round"
                              className="transition-all duration-1000 ease-out"
                            />
                          </svg>
                          <span className="absolute text-lg font-extrabold text-slate-800">{atsScoreData.score}%</span>
                        </div>
                        <div className="text-[0.65rem] text-slate-500 font-bold uppercase tracking-wider mt-2">Overall Match</div>
                      </div>
                      <div className="flex-grow text-xs text-slate-600 leading-relaxed">
                        <p className="mb-3 font-medium text-slate-700 bg-white/50 p-3 rounded-lg border border-slate-100">{atsScoreData.summary}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
                            <strong className="text-emerald-600 block mb-1.5 text-[0.7rem] uppercase tracking-wide"><i className="fas fa-check mr-1"></i> Matched Skills</strong>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {atsScoreData.matched_skills.map((skill, idx) => (
                                <span key={idx} className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold">{skill}</span>
                              ))}
                              {atsScoreData.matched_skills.length === 0 && <span className="text-slate-400">None identified</span>}
                            </div>
                          </div>
                          <div className="bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                            <strong className="text-rose-600 block mb-1.5 text-[0.7rem] uppercase tracking-wide"><i className="fas fa-triangle-exclamation mr-1"></i> Missing Skills</strong>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {atsScoreData.missing_skills.map((skill, idx) => (
                                <span key={idx} className="bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold">{skill}</span>
                              ))}
                              {atsScoreData.missing_skills.length === 0 && <span className="text-slate-400">None identified</span>}
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
              </Card>

              {/* Card 3: Advanced AI Customizations (Accordions) */}
              <div className="flex flex-col gap-4">
                {/* Custom Questions Section */}
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-question-circle text-primary"></i> Custom Screening Questions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500">Provide pre-defined questions that the AI will ask first</span>
                      <button
                        type="button"
                        onClick={() => document.getElementById('singleCustomInput').click()}
                        className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-2.5 py-1 cursor-pointer transition-all"
                      >
                        <i className="fas fa-paperclip"></i> Upload questions
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
                              Swal.fire({
                                title: 'Parsing Failed',
                                text: err,
                                icon: 'error',
                                confirmButtonColor: '#6366f1'
                              })
                              setCustomQuestionsParsing(false)
                            } else {
                              handleSingleChange('customQuestions', data.text || '')
                            }
                          }, setCustomQuestionsParsing)
                        }}
                      />
                    </div>
                    {customQuestionsParsing && <span className="text-xs text-warning font-semibold"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing questions file...</span>}
                    <Textarea
                      placeholder="Enter custom screening questions here (one per line) or attach a file above. If provided, the AI interviewer will prioritize these questions."
                      value={singleCandidate.customQuestions}
                      onChange={(e) => handleSingleChange('customQuestions', e.target.value)}
                    />
                  </div>
                </div>

                {/* AI Instructions Section */}
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-robot text-primary"></i> Custom AI Interviewer Instructions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500">Provide behavioral rules or focus topics to guide the AI</span>
                      <button
                        type="button"
                        onClick={() => document.getElementById('singleAiInstructionsInput').click()}
                        className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-2.5 py-1 cursor-pointer transition-all"
                      >
                        <i className="fas fa-paperclip"></i> Upload instructions
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
                              Swal.fire({
                                title: 'Parsing Failed',
                                text: err,
                                icon: 'error',
                                confirmButtonColor: '#6366f1'
                              })
                              setAiInstructionsParsing(false)
                            } else {
                              handleSingleChange('aiInstructions', data.text || '')
                            }
                          }, setAiInstructionsParsing)
                        }}
                      />
                    </div>
                    {aiInstructionsParsing && <span className="text-xs text-warning font-semibold"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing instructions file...</span>}
                    <Textarea
                      placeholder="e.g. 'Focus heavily on microservices architecture and system design. Restrict standard icebreakers. Keep the conversation extremely professional.'"
                      value={singleCandidate.aiInstructions}
                      onChange={(e) => handleSingleChange('aiInstructions', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Settings, Customization & Actions (Col Span 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Card 1: Configuration Parameters */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-sliders text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Interview Settings</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Configure parameters, timing, and languages</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Interview Format"
                    value={singleCandidate.interviewFormat}
                    onChange={(e) => handleSingleChange('interviewFormat', e.target.value)}
                    options={[
                      { value: 'Standard', label: 'Standard (Text/Form Based)' },
                      { value: 'Voice', label: 'Voice AI (Real-time Speech)' }
                    ]}
                  />

                  <Select
                    label="Interview Type"
                    value={singleCandidate.interviewType}
                    onChange={(e) => {
                      const type = e.target.value
                      handleSingleChange('interviewType', type)
                      if (type === 'Technical' && singleCandidate.language !== 'English') {
                        Swal.fire({
                          title: 'Language Limitation',
                          text: 'Coding round is currently restricted to English language interviews. Switching language to English.',
                          icon: 'info',
                          confirmButtonColor: '#6366f1'
                        })
                        handleSingleChange('language', 'English')
                      }
                    }}
                    options={[
                      { value: 'Technical', label: 'Technical (+ Coding)' },
                      { value: 'Normal', label: 'Normal (Standard AI)' },
                      { value: 'Non-Technical', label: 'Non-Tech (Case Studies)' }
                    ]}
                  />

                  <Select
                    label="Language"
                    value={singleCandidate.language}
                    onChange={(e) => {
                      const lang = e.target.value
                      handleSingleChange('language', lang)
                      if (lang !== 'English' && singleCandidate.interviewType === 'Technical') {
                        Swal.fire({
                          title: 'Interview Type Adjusted',
                          text: 'Coding round is currently restricted to English language interviews. Switching to Normal interview type.',
                          icon: 'info',
                          confirmButtonColor: '#6366f1'
                        })
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

                  <div className="sm:col-span-2">
                    <Select
                      label="Industry Type"
                      value={singleCandidate.industry}
                      onChange={(e) => handleSingleChange('industry', e.target.value)}
                      options={[
                        { value: 'General', label: 'General (No Specific)' },
                        { value: 'Information Technology', label: 'Information Technology' },
                        { value: 'Software & SaaS', label: 'Software & SaaS' },
                        { value: 'Healthcare', label: 'Healthcare' },
                        { value: 'Financial Services', label: 'Financial Services' },
                        { value: 'Education', label: 'Education' },
                        { value: 'Human Resources & Staffing', label: 'Human Resources & Staffing' }
                      ]}
                    />
                  </div>

                  {singleCandidate.interviewType === 'Non-Technical' && (
                    <div className="sm:col-span-2">
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
                    </div>
                  )}
                </div>
              </Card>

              {/* Card 2: Scheduling Options */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-3.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-calendar-check text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Interview Schedule</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Enable time restrictions (Optional)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="flex gap-2.5 items-start bg-slate-50 p-3.5 rounded-2xl border border-slate-150 mt-1">
                  <i className="fas fa-circle-info text-indigo-500 text-xs mt-0.5"></i>
                  <p className="text-[0.7rem] text-slate-500 leading-normal font-medium">
                    Leave dates empty for immediate access (24h default expiry). If configured, candidates can only access the assessment within the specified window.
                  </p>
                </div>
              </Card>

              {/* Card 3: Camera Video Config */}
              <div className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 flex justify-between items-center shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-300 transition-all duration-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-video text-sm"></i>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="singleRecordVideo" className="text-xs font-extrabold uppercase tracking-wider text-slate-700 cursor-pointer">
                      Record Interview Video
                    </label>
                    <span className="text-[0.7rem] text-slate-400 font-medium">Record candidate video via webcam during assessment</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="singleRecordVideo"
                    checked={singleCandidate.recordVideo}
                    onChange={(e) => handleSingleChange('recordVideo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Card 4: HR Screening Parameters (Toggles) */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-3.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-clipboard-question text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">HR Screening Questions</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Collect candidate preferences (Optional)</p>
                  </div>
                </div>

                <p className="text-[0.7rem] text-slate-500 leading-normal mb-1 font-medium">
                  AI will dynamically query and extract candidate responses for the configured attributes at the end of the interview.
                </p>

                <div className="flex flex-col gap-3">
                  {/* Work Mode Screening */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="singleAskWorkMode" className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-building text-slate-400 text-xs"></i> Work Mode Preference
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          id="singleAskWorkMode"
                          checked={singleCandidate.hrScreening.askWorkMode}
                          onChange={(e) => handleSingleHrChange('askWorkMode', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    {singleCandidate.hrScreening.askWorkMode && (
                      <div className="flex gap-2 border-t border-slate-100 pt-2.5 flex-wrap">
                        {['On-site', 'Remote', 'Hybrid'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleSingleHrChange('workModeType', mode)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${
                              singleCandidate.hrScreening.workModeType === mode
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Location Screening */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="singleAskLocation" className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-map-location-dot text-slate-400 text-xs"></i> Location Check
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          id="singleAskLocation"
                          checked={singleCandidate.hrScreening.askLocation}
                          onChange={(e) => handleSingleHrChange('askLocation', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    {singleCandidate.hrScreening.askLocation && (
                      <div className="flex gap-2 border-t border-slate-100 pt-2.5 flex-wrap">
                        {['Current', 'Preferred'].map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handleSingleHrChange('locationType', loc)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${
                              singleCandidate.hrScreening.locationType === loc
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {loc === 'Current' ? 'Current Location' : 'Preferred Location'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bond Screening */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex justify-between items-center">
                    <label htmlFor="singleAskBond" className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                      <i className="fas fa-file-signature text-slate-400 text-xs"></i> Bond / Notice Period Info
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="singleAskBond"
                        checked={singleCandidate.hrScreening.askBond}
                        onChange={(e) => handleSingleHrChange('askBond', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Form Action Controls */}
              <div className="flex gap-3.5 flex-col sm:flex-row mt-2">
                <Button
                  variant="primary"
                  className="flex-1 shadow-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl"
                  onClick={handleGenerateInterviewLink}
                  disabled={inviting}
                  icon={<i className="fas fa-bolt" />}
                >
                  Generate Link
                </Button>
                <Button
                  variant="warning"
                  className="flex-1 rounded-xl"
                  onClick={() => handlePreviewEmail('single')}
                  icon={<i className="fas fa-eye" />}
                >
                  Preview Email
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk send panel */}
        {createTab === 'bulk' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Requirements & Material Details (Col Span 7) */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              {/* Card 1: Requirement Documents */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-file-invoice text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Job Description Profile</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Provide description to target questions dynamically</p>
                  </div>
                </div>

                {/* Job Description (Bulk) */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 m-0">Job Description <span className="text-rose-500">*</span></label>
                    <button
                      type="button"
                      onClick={() => document.getElementById('bulkJdInput').click()}
                      className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-3 py-1 cursor-pointer transition-all"
                    >
                      <i className="fas fa-paperclip"></i> Upload file
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
                            Swal.fire({
                              title: 'Parsing Failed',
                              text: err,
                              icon: 'error',
                              confirmButtonColor: '#6366f1'
                            })
                            setBulkJdParsing(false)
                          } else {
                            handleBulkConfigChange('jobDescription', data.text || '')
                          }
                        }, setBulkJdParsing)
                      }}
                    />
                  </div>
                  {bulkJdParsing && <span className="text-xs text-warning font-semibold mt-1"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing Job Description...</span>}
                  <Textarea
                    placeholder="Paste the job description details to be evaluated for ALL candidates, or attach a file above..."
                    value={bulkConfig.jobDescription}
                    onChange={(e) => handleBulkConfigChange('jobDescription', e.target.value)}
                  />
                </div>
              </Card>

              {/* Card 2: Accordion Options */}
              <div className="flex flex-col gap-4">
                {/* Custom Questions Section (Bulk) */}
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-question-circle text-primary"></i> Custom Screening Questions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500">Provide pre-defined questions that the AI will ask first</span>
                      <button
                        type="button"
                        onClick={() => document.getElementById('bulkCustomInput').click()}
                        className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-2.5 py-1 cursor-pointer transition-all"
                      >
                        <i className="fas fa-paperclip"></i> Upload questions
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
                              Swal.fire({
                                title: 'Parsing Failed',
                                text: err,
                                icon: 'error',
                                confirmButtonColor: '#6366f1'
                              })
                              setBulkCustomQuestionsParsing(false)
                            } else {
                              handleBulkConfigChange('customQuestions', data.text || '')
                            }
                          }, setBulkCustomQuestionsParsing)
                        }}
                      />
                    </div>
                    {bulkCustomQuestionsParsing && <span className="text-xs text-warning font-semibold"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing questions file...</span>}
                    <Textarea
                      placeholder="Enter custom screening questions here (one per line) or attach a file above. If provided, the AI interviewer will prioritize these questions."
                      value={bulkConfig.customQuestions}
                      onChange={(e) => handleBulkConfigChange('customQuestions', e.target.value)}
                    />
                  </div>
                </div>

                {/* AI Instructions Section (Bulk) */}
                <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-robot text-primary"></i> Custom AI Interviewer Instructions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500">Provide behavioral rules or focus topics to guide the AI</span>
                      <button
                        type="button"
                        onClick={() => document.getElementById('bulkAiInstructionsInput').click()}
                        className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-2.5 py-1 cursor-pointer transition-all"
                      >
                        <i className="fas fa-paperclip"></i> Upload instructions
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
                              Swal.fire({
                                title: 'Parsing Failed',
                                text: err,
                                icon: 'error',
                                confirmButtonColor: '#6366f1'
                              })
                              setBulkAiInstructionsParsing(false)
                            } else {
                              handleBulkConfigChange('aiInstructions', data.text || '')
                            }
                          }, setBulkAiInstructionsParsing)
                        }}
                      />
                    </div>
                    {bulkAiInstructionsParsing && <span className="text-xs text-warning font-semibold"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing instructions file...</span>}
                    <Textarea
                      placeholder="e.g. 'Focus heavily on microservices architecture and system design. Restrict standard icebreakers. Keep the conversation extremely professional.'"
                      value={bulkConfig.aiInstructions}
                      onChange={(e) => handleBulkConfigChange('aiInstructions', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Settings, Candidates & Submission (Col Span 5) */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Card 1: Configuration */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-sliders text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Interview Settings (Bulk)</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Parameters apply globally to all candidates</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Interview Format"
                    value={bulkConfig.interviewFormat}
                    onChange={(e) => handleBulkConfigChange('interviewFormat', e.target.value)}
                    options={[
                      { value: 'Standard', label: 'Standard (Text/Form Based)' },
                      { value: 'Voice', label: 'Voice AI (Real-time Speech)' }
                    ]}
                  />

                  <Select
                    label="Interview Type"
                    value={bulkConfig.interviewType}
                    onChange={(e) => {
                      const type = e.target.value
                      handleBulkConfigChange('interviewType', type)
                      if (type === 'Technical' && bulkConfig.language !== 'English') {
                        Swal.fire({
                          title: 'Language Limitation',
                          text: 'Coding round is currently restricted to English language interviews. Switching language to English.',
                          icon: 'info',
                          confirmButtonColor: '#6366f1'
                        })
                        handleBulkConfigChange('language', 'English')
                      }
                    }}
                    options={[
                      { value: 'Technical', label: 'Technical (+ Coding)' },
                      { value: 'Normal', label: 'Normal (Standard AI)' },
                      { value: 'Non-Technical', label: 'Non-Tech (Case Studies)' }
                    ]}
                  />

                  <Select
                    label="Language"
                    value={bulkConfig.language}
                    onChange={(e) => {
                      const lang = e.target.value
                      handleBulkConfigChange('language', lang)
                      if (lang !== 'English' && bulkConfig.interviewType === 'Technical') {
                        Swal.fire({
                          title: 'Interview Type Adjusted',
                          text: 'Coding round is currently restricted to English language interviews. Switching to Normal interview type.',
                          icon: 'info',
                          confirmButtonColor: '#6366f1'
                        })
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

                  <div className="sm:col-span-2">
                    <Select
                      label="Industry Type"
                      value={bulkConfig.industry}
                      onChange={(e) => handleBulkConfigChange('industry', e.target.value)}
                      options={[
                        { value: 'General', label: 'General (No Specific)' },
                        { value: 'Information Technology', label: 'Information Technology' },
                        { value: 'Software & SaaS', label: 'Software & SaaS' },
                        { value: 'Healthcare', label: 'Healthcare' },
                        { value: 'Financial Services', label: 'Financial Services' },
                        { value: 'Education', label: 'Education' },
                        { value: 'Human Resources & Staffing', label: 'Human Resources & Staffing' }
                      ]}
                    />
                  </div>

                  {bulkConfig.interviewType === 'Non-Technical' && (
                    <div className="sm:col-span-2">
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
                    </div>
                  )}
                </div>
              </Card>

              {/* Card 2: Scheduling Options (Bulk) */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-3.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-calendar-check text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Interview Schedule</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Global access window restrictions</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                <div className="flex gap-2.5 items-start bg-slate-50 p-3.5 rounded-2xl border border-slate-150 mt-1">
                  <i className="fas fa-circle-info text-indigo-500 text-xs mt-0.5"></i>
                  <p className="text-[0.7rem] text-slate-500 leading-normal font-medium">
                    Leave dates empty for immediate access. Configured values enforce global timing access for all candidates.
                  </p>
                </div>
              </Card>

              {/* Card 3: Camera Video Options (Bulk) */}
              <div className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 flex justify-between items-center shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-300 transition-all duration-200">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-video text-sm"></i>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="bulkRecordVideo" className="text-xs font-extrabold uppercase tracking-wider text-slate-700 cursor-pointer">
                      Record Interview Video
                    </label>
                    <span className="text-[0.7rem] text-slate-400 font-medium">Webcam video recording default for all bulk candidates</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="bulkRecordVideo"
                    checked={bulkConfig.recordVideo}
                    onChange={(e) => handleBulkConfigChange('recordVideo', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {/* Card 4: HR Screening Parameters (Bulk toggles) */}
              <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-slate-100/80 pb-3.5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-50 border border-indigo-100 text-primary shadow-inner">
                    <i className="fas fa-clipboard-question text-base"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">HR Screening Questions</h3>
                    <p className="text-[0.7rem] text-slate-400 font-medium">Collect candidate preferences (Optional)</p>
                  </div>
                </div>

                <p className="text-[0.7rem] text-slate-500 leading-normal mb-1 font-medium">
                  AI will query preferences at the end of each session.
                </p>

                <div className="flex flex-col gap-3">
                  {/* Work Mode */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="bulkAskWorkMode" className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-building text-slate-400 text-xs"></i> Work Mode Preference
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          id="bulkAskWorkMode"
                          checked={bulkConfig.hrScreening.askWorkMode}
                          onChange={(e) => handleBulkHrChange('askWorkMode', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    {bulkConfig.hrScreening.askWorkMode && (
                      <div className="flex gap-2 border-t border-slate-100 pt-2.5 flex-wrap">
                        {['On-site', 'Remote', 'Hybrid'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleBulkHrChange('workModeType', mode)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${
                              bulkConfig.hrScreening.workModeType === mode
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="bulkAskLocation" className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-map-location-dot text-slate-400 text-xs"></i> Location Check
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          id="bulkAskLocation"
                          checked={bulkConfig.hrScreening.askLocation}
                          onChange={(e) => handleBulkHrChange('askLocation', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>
                    {bulkConfig.hrScreening.askLocation && (
                      <div className="flex gap-2 border-t border-slate-100 pt-2.5 flex-wrap">
                        {['Current', 'Preferred'].map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handleBulkHrChange('locationType', loc)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${
                              bulkConfig.hrScreening.locationType === loc
                                ? 'bg-primary text-white shadow-sm'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {loc === 'Current' ? 'Current Location' : 'Preferred Location'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bond */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50/50 flex justify-between items-center">
                    <label htmlFor="bulkAskBond" className="text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                      <i className="fas fa-file-signature text-slate-400 text-xs"></i> Bond / Notice Period Info
                    </label>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="bulkAskBond"
                        checked={bulkConfig.hrScreening.askBond}
                        onChange={(e) => handleBulkHrChange('askBond', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                    </label>
                  </div>
                </div>
              </Card>

              {/* Card 5: Excel/CSV Upload Dropzone */}
              <div className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 flex flex-col gap-4 shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-300 transition-all duration-200">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-file-excel text-emerald-650 text-sm"></i>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Import Candidates</label>
                  </div>
                  <button
                    type="button"
                    onClick={downloadExcelTemplate}
                    className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-500/15 px-3 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-all"
                  >
                    <i className="fas fa-download"></i> Get Template
                  </button>
                </div>

                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer bg-slate-50/50 hover:bg-white hover:border-emerald-500/80 hover:shadow-md hover:shadow-emerald-500/5 hover:-translate-y-0.5 transition-all duration-300 flex flex-col items-center justify-center gap-2 group"
                  onClick={() => document.getElementById('bulkExcelInput').click()}
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-all">
                    <i className="fas fa-file-arrow-up text-lg"></i>
                  </div>
                  <p className="font-bold text-slate-650 text-xs mt-1">
                    {bulkCsvLabel}
                  </p>
                </div>
                <input
                  type="file"
                  id="bulkExcelInput"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleBulkFileUpload}
                />
              </div>

              {/* Card 6: Manual Candidates Addition Form */}
              <div className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 flex flex-col gap-4 shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-350 transition-all duration-200">
                <div className="flex gap-2 items-center border-b border-slate-100 pb-2.5">
                  <i className="fas fa-user-plus text-primary text-xs"></i>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 m-0">Add Candidate Manually</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
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
                    className="px-5 py-2.5 h-[42px] rounded-lg font-bold shadow-sm"
                    onClick={() => {
                      const { name, email } = bulkCandidateInput
                      if (!name || !email) {
                        Swal.fire({
                          title: 'Fields Required',
                          text: 'Name and email are required to add a candidate manually.',
                          icon: 'warning',
                          confirmButtonColor: '#6366f1'
                        })
                        return
                      }
                      if (!email.includes('@')) {
                        Swal.fire({
                          title: 'Invalid Email',
                          text: 'Invalid candidate email format.',
                          icon: 'warning',
                          confirmButtonColor: '#6366f1'
                        })
                        return
                      }
                      if (bulkCandidates.find(c => c.email === email)) {
                        Swal.fire({
                          title: 'Candidate Duplicate',
                          text: 'Candidate already exists in the list.',
                          icon: 'warning',
                          confirmButtonColor: '#6366f1'
                        })
                        return
                      }
                      setBulkCandidates(prev => [...prev, { name, email, record_video: true }])
                      setBulkCandidateInput({ name: '', email: '' })
                    }}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {/* Form Action Controls (Bulk) */}
              <div className="flex gap-3.5 flex-col sm:flex-row mt-2">
                <Button
                  variant="primary"
                  className="flex-1 shadow-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl"
                  onClick={handleSendBulkInterviews}
                  disabled={inviting}
                  icon={<i className="fas fa-paper-plane" />}
                >
                  Send to All
                </Button>
                <Button
                  variant="warning"
                  className="flex-1 rounded-xl"
                  onClick={() => handlePreviewEmail('bulk')}
                  icon={<i className="fas fa-eye" />}
                >
                  Preview Email
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Added Candidates Table (only shown in bulk view) */}
        {createTab === 'bulk' && (
          <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-4 mt-2">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <i className="fas fa-list-check text-primary text-xs"></i> Candidates List (<strong className="text-primary font-extrabold">{bulkCandidates.length}</strong>)
              </h4>
              {bulkCandidates.length > 0 && (
                <button
                  type="button"
                  className="bg-transparent border-none text-rose-500 hover:text-rose-600 text-xs cursor-pointer font-bold flex items-center gap-1"
                  onClick={() => setBulkCandidates([])}
                >
                  <i className="fas fa-trash-can"></i> Clear All
                </button>
              )}
            </div>

            {bulkCandidates.length === 0 ? (
              <div className="p-8 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-2 bg-slate-50/20">
                <i className="fas fa-users-slash text-2xl opacity-60"></i>
                <p>No candidates added yet. Upload Excel/CSV template or add manually.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white shadow-sm">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#e2e8f0]">
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 uppercase tracking-wider">Candidate Name</th>
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 uppercase tracking-wider">Email Address</th>
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 uppercase tracking-wider w-[140px]">Record Video</th>
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 uppercase tracking-wider w-[80px] text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkCandidates.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-700 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-primary text-[0.6rem] font-bold flex items-center justify-center">
                            {c.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          {c.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-medium">{c.email}</td>
                        <td className="px-4 py-3 text-xs">
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={c.record_video}
                              onChange={(e) => {
                                const copy = [...bulkCandidates]
                                copy[i].record_video = e.target.checked
                                setBulkCandidates(copy)
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
                          </label>
                        </td>
                        <td className="px-4 py-3 text-xs text-center">
                          <button
                            type="button"
                            className="bg-transparent border-none text-rose-500 hover:text-rose-600 cursor-pointer transition-colors p-1"
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
          </Card>
        )}

        {/* Created Links Section */}
        {createTab === 'single' && (
          <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-4 mt-2">
            <div className="flex gap-3.5 items-center border-b border-slate-100 pb-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100 text-emerald-500 shadow-inner">
                <i className="fas fa-link text-base"></i>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-800 tracking-tight">Generated Links</h3>
                <p className="text-[0.7rem] text-slate-450 font-medium">Share these with candidates to start interviews</p>
              </div>
            </div>

            {singleCreatedLinks.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-2 bg-slate-50/20">
                <i className="fas fa-link-slash text-2xl opacity-60"></i>
                <p>No interview links generated yet in this session.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {singleCreatedLinks.map((link, idx) => (
                  <div key={idx} className="flex justify-between items-center flex-wrap gap-3 p-3 bg-slate-50/70 border border-slate-200 rounded-xl hover:border-slate-350 transition-all shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                        <i className="fas fa-link"></i>
                      </div>
                      <div>
                        <strong className="text-xs text-slate-800 block font-bold">{link.name}</strong>
                        <span className="text-[0.7rem] text-slate-500 font-medium">{link.email}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="px-3.5 py-1.5 text-xs h-[32px] border-slate-200 rounded-lg bg-white shadow-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/interview?session_id=${link.id}`)
                          Swal.fire({
                            title: 'Link Copied',
                            text: 'Copied link to clipboard!',
                            icon: 'success',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000
                          })
                        }}
                      >
                        Copy Link
                      </Button>
                      <a
                        href={`/interview?session_id=${link.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-1.5 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-lg border border-transparent shadow-[0_2px_8px_rgba(99,102,241,0.1)] hover:-translate-y-0.5 transition-all text-center flex items-center justify-center text-white no-underline leading-none"
                      >
                        Start Interview
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

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
    </>
  )
}
