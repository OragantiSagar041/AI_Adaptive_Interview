import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Textarea from '../../components/Textarea'
import Select from '../../components/Select'
import { EmailPreviewModal, BulkResultsModal } from '../../components/admin/modals/AdminModals'
import { loadSuperAdminDashboard } from '../../store/slices/dashboardSlice'
import { createSuperAdminInterview } from '../../store/slices/interviewSlice'

export default function CreateInterviewPage() {
  const dispatch = useDispatch()
  const token = useSelector(state => state.auth.token)
  const adminUser = useSelector(state => state.auth.adminUser)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Form input states
  const [createTab, setCreateTab] = useState('single') // 'single' | 'bulk'
  const [inviting, setInviting] = useState(false)

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
      alert("Failed to calculate ATS match score.")
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

      setEmailTemplate({
        headHtml: doc.head ? doc.head.innerHTML : '',
        bodyAttributes,
        bodyInnerHtml: doc.body ? doc.body.innerHTML : data.html
      })

      setEmailPreviewModalOpen(true)
    } catch (e) {
      alert('Could not generate email preview: ' + (e.response?.data?.detail || e.message))
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
      const data = await dispatch(createSuperAdminInterview({
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
      })).unwrap()

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

      dispatch(loadSuperAdminDashboard())
    } catch (e) {
      console.error(e)
      alert(e.detail || e.message || "Failed to create session.")
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
      const data = await dispatch(createSuperAdminInterview({
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
      })).unwrap()

      alert(`Successfully sent ${data.successful}/${data.total} interviews!`)
      setBulkResultsData(data)
      setBulkResultsModalOpen(true)
      setBulkCandidates([])
      setCustomEmailHtml('')
      dispatch(loadSuperAdminDashboard())
    } catch (e) {
      console.error(e)
      alert(e.detail || e.message || "Error sending bulk interviews.")
    } finally {
      setInviting(false)
    }
  }

  return (
    <>
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
