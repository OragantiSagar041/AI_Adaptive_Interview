import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import Swal from 'sweetalert2'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Textarea from '../../components/Textarea'
import Select from '../../components/Select'
import { EmailPreviewModal, BulkResultsModal, convertHtmlToPlainText, convertPlainTextToHtml } from '../../components/admin/modals/AdminModals'
import { loadSuperAdminDashboard } from '../../store/slices/dashboardSlice'
import { createSuperAdminInterview } from '../../store/slices/interviewSlice'

import { CustomToggleSwitch, FeatureLockOverlay } from './CreateInterviewShared'
export { CustomToggleSwitch, FeatureLockOverlay } from './CreateInterviewShared'

const CreateInterviewSingleTab = React.lazy(() => import('./CreateInterviewSingleTab'))
const CreateInterviewBulkTab = React.lazy(() => import('./CreateInterviewBulkTab'))

export default function CreateInterviewPage() {
  const dispatch = useDispatch()
  const location = useLocation()
  const token = useSelector(state => state.auth.token)
  const adminUser = useSelector(state => state.auth.adminUser)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const userFeatures = adminUser?.plan_features || []
  const hasCustomScreening = userFeatures.includes('Custom Screening Questions')
  const hasCustomAIInstructions = userFeatures.includes('Custom AI Interviewer Instructions')
  const hasIndustry = userFeatures.includes('Industry Type')

  // Form input states
  const [createTab, setCreateTab] = useState(() => {
    return sessionStorage.getItem('createInterview_tab') || 'single'
  }) // 'single' | 'bulk'

  useEffect(() => {
    sessionStorage.setItem('createInterview_tab', createTab)
  }, [createTab])
  const [inviting, setInviting] = useState(false)

  // Collapsible Accordion States
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [bulkQuestionsOpen, setBulkQuestionsOpen] = useState(false)
  const [bulkInstructionsOpen, setBulkInstructionsOpen] = useState(false)

  const [singleCandidate, setSingleCandidate] = useState(() => {
    let defaultState = {
      name: '',
      email: '',
      phone: '',
      resumeText: '',
      jobDescription: '',
      applicationId: '',
      jobId: '',
      jobTitle: '',
      customQuestions: [],
      aiInstructions: [],
      industry: 'General',
      interviewFormat: 'Standard',
      interviewType: 'Technical',
      language: 'English',
      caseStudyCount: 3,
      duration: 30,
      scheduledStart: '',
      scheduledEnd: '',
      recordVideo: true,
      voiceCloning: false,
      hrScreening: {
        askWorkMode: false,
        workModeType: 'On-site',
        askLocation: false,
        locationType: 'Current',
        askBond: false
      }
    };

    try {
      const stored = sessionStorage.getItem('createInterview_singleCandidate')
      if (stored) {
        let parsed = JSON.parse(stored);
        if (typeof parsed.customQuestions === 'string') {
          parsed.customQuestions = parsed.customQuestions ? parsed.customQuestions.split('\n').map(q => q.trim()).filter(Boolean) : [];
        }
        if (typeof parsed.aiInstructions === 'string') {
          parsed.aiInstructions = parsed.aiInstructions ? parsed.aiInstructions.split('\n').map(i => i.trim()).filter(Boolean) : [];
        }
        defaultState = { ...defaultState, ...parsed };
      }
    } catch (e) {
      console.error('Failed to parse stored singleCandidate', e)
    }

    // Override with incoming data from navigation if present
    if (location.state && location.state.candidateData) {
      const cd = location.state.candidateData;
      if (cd.name) defaultState.name = cd.name;
      if (cd.email) defaultState.email = cd.email;
      if (cd.phone) defaultState.phone = cd.phone;
      if (cd.resumeText) defaultState.resumeText = cd.resumeText;
      if (cd.jobDescription) defaultState.jobDescription = cd.jobDescription;
      if (cd.applicationId) defaultState.applicationId = cd.applicationId;
      if (cd.jobId) defaultState.jobId = cd.jobId;
      if (cd.jobTitle) defaultState.jobTitle = cd.jobTitle;
    }

    return defaultState;
  })

  useEffect(() => {
    if (location.state && location.state.candidateData) {
      const cd = location.state.candidateData;
      setSingleCandidate(prev => ({
        ...prev,
        name: cd.name || prev.name || '',
        email: cd.email || prev.email || '',
        phone: cd.phone || prev.phone || '',
        resumeText: cd.resumeText || prev.resumeText || '',
        jobDescription: cd.jobDescription || prev.jobDescription || '',
        applicationId: cd.applicationId || prev.applicationId || '',
        jobId: cd.jobId || prev.jobId || '',
        jobTitle: cd.jobTitle || prev.jobTitle || ''
      }));
      setCreateTab('single');
    }
  }, [location.state]);

  useEffect(() => {
    sessionStorage.setItem('createInterview_singleCandidate', JSON.stringify(singleCandidate))
  }, [singleCandidate])

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
  const [bulkConfig, setBulkConfig] = useState(() => {
    let defaultState = {
      jobDescription: '',
      customQuestions: [],
      aiInstructions: [],
      industry: 'General',
      interviewFormat: 'Standard',
      interviewType: 'Technical',
      language: 'English',
      caseStudyCount: 3,
      duration: 30,
      scheduledStart: '',
      scheduledEnd: '',
      recordVideo: true,
      voiceCloning: false,
      hrScreening: {
        askWorkMode: false,
        workModeType: 'On-site',
        askLocation: false,
        locationType: 'Current',
        askBond: false
      }
    };

    try {
      const stored = sessionStorage.getItem('createInterview_bulkConfig')
      if (stored) {
        let parsed = JSON.parse(stored);
        if (typeof parsed.customQuestions === 'string') {
          parsed.customQuestions = parsed.customQuestions ? parsed.customQuestions.split('\n').map(q => q.trim()).filter(Boolean) : [];
        }
        if (typeof parsed.aiInstructions === 'string') {
          parsed.aiInstructions = parsed.aiInstructions ? parsed.aiInstructions.split('\n').map(i => i.trim()).filter(Boolean) : [];
        }
        defaultState = { ...defaultState, ...parsed };
      }
    } catch (e) {
      console.error('Failed to parse stored bulkConfig', e)
    }
    return defaultState;
  })

  useEffect(() => {
    sessionStorage.setItem('createInterview_bulkConfig', JSON.stringify(bulkConfig))
  }, [bulkConfig])

  const [bulkCandidates, setBulkCandidates] = useState(() => {
    try {
      const stored = sessionStorage.getItem('createInterview_bulkCandidates')
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.error('Failed to parse stored bulkCandidates', e)
    }
    return []
  }) // [{ name, email, record_video }]

  useEffect(() => {
    sessionStorage.setItem('createInterview_bulkCandidates', JSON.stringify(bulkCandidates))
  }, [bulkCandidates])
  const [bulkJdParsing, setBulkJdParsing] = useState(false)
  const [bulkCustomQuestionsParsing, setBulkCustomQuestionsParsing] = useState(false)
  const [bulkAiInstructionsParsing, setBulkAiInstructionsParsing] = useState(false)

  // Bulk submission results
  const [bulkResultsModalOpen, setBulkResultsModalOpen] = useState(false)
  const [bulkResultsData, setBulkResultsData] = useState(null)

  // Custom Voices
  const [availableVoices, setAvailableVoices] = useState([])
  useEffect(() => {
    async function fetchVoices() {
      try {
        const res = await axios.get(`${API_BASE_URL}/admin/voices`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.data.status === 'success') {
          setAvailableVoices(res.data.voices)
        }
      } catch (err) {
        console.error("Failed to fetch available voices:", err)
      }
    }
    if (token) fetchVoices()
  }, [token, API_BASE_URL])

  // Fetch AI Call Logs for Dropdown
  const [callLogs, setCallLogs] = useState([])
  useEffect(() => {
    async function fetchLogs() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/calls/interested-candidates`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await response.json()
        if (response.ok) {
          setCallLogs(data.candidates || [])
        }
      } catch (e) {
        console.error("Failed to fetch interested candidates logs", e)
      }
    }
    if (token && createTab === 'single') {
      fetchLogs()
    }
  }, [token, API_BASE_URL, createTab])

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
  const handleParseFile = async (file, onParsed, onLoading, source = 'resume', uploadToCloud = false) => {
    if (!file) return
    onLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    formData.append('source', source)
    if (uploadToCloud) {
      formData.append('upload_to_cloud', 'true')
    }
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/parse-resume`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${sessionStorage.getItem('superadminToken') || sessionStorage.getItem('adminToken')}`
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

  const lastCheckedEmailRef = useRef('')
  const emailDebounceRef = useRef(null)

  // Check if candidate already has a profile/resume on file
  const handleCheckCandidate = async (email, force = false) => {
    if (!email || !email.includes('@')) return
    const cleanEmail = email.trim().toLowerCase()
    if (!force && lastCheckedEmailRef.current === cleanEmail) return

    try {
      const response = await axios.get(`${API_BASE_URL}/admin/candidate/check?email=${encodeURIComponent(cleanEmail)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = response.data
      if (data.exists) {
        lastCheckedEmailRef.current = cleanEmail
        const hasResume = Boolean(data.resume_text && data.resume_text.trim().length > 10)
        const result = await Swal.fire({
          title: 'Candidate Profile Found',
          html: `
            <div class="flex flex-col items-center text-center gap-3 mt-3">
              <div class="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner mb-1">
                <i class="fas fa-user-check text-2xl animate-pulse"></i>
              </div>
              <p class="text-[0.9rem] text-slate-600 dark:text-slate-400 leading-relaxed px-1 font-medium">
                An existing profile was found for <strong class="text-indigo-600 font-bold">${cleanEmail}</strong>${data.candidate_name ? ` (${data.candidate_name})` : ''}.
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 font-normal">
                ${hasResume ? '📄 A saved resume is available on file. Would you like to automatically fill the candidate details and resume?' : 'Would you like to automatically fill the saved candidate details?'}
              </p>
            </div>
          `,
          showCancelButton: true,
          confirmButtonText: hasResume ? 'Yes, Autofill Profile & Resume' : 'Yes, Autofill Details',
          cancelButtonText: 'No, Keep Blank',
          confirmButtonColor: '#6366f1',
          cancelButtonColor: '#1e293b',
          customClass: {
            popup: 'rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 bg-white dark:bg-[#161c2d]',
            title: 'text-lg font-bold text-slate-800 dark:text-slate-100 font-sans tracking-tight pt-2',
            confirmButton: 'px-5 py-2.5 rounded-xl font-bold text-xs !border-2 !border-indigo-400 dark:!border-indigo-400 text-white shadow-md transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mr-2',
            cancelButton: 'px-5 py-2.5 rounded-xl font-bold text-xs !border-2 !border-slate-400 dark:!border-slate-500 text-slate-800 dark:text-slate-200 shadow-sm transition-all hover:bg-slate-200 dark:hover:bg-slate-800 focus:outline-none'
          },
          buttonsStyling: true
        })
        if (result.isConfirmed) {
          setSingleCandidate(prev => ({
            ...prev,
            name: data.candidate_name || prev.name,
            email: cleanEmail,
            resumeText: data.resume_text || prev.resumeText,
            resumeFileName: hasResume ? 'Existing candidate resume profile' : prev.resumeFileName,
            phone: data.candidate_phone || prev.phone
          }))

          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: hasResume ? 'Profile & resume autofilled!' : 'Candidate details autofilled!',
            showConfirmButton: false,
            timer: 2500,
            timerProgressBar: true
          })

          const effectiveResume = data.resume_text || singleCandidate.resumeText
          const effectiveJd = singleCandidate.jobDescription
          if (effectiveResume && effectiveJd) {
            handleCalculateAts(effectiveResume, effectiveJd)
          }
        }
      }
    } catch (e) {
      console.error('Candidate check error:', e)
    }
  }

  // Calculate ATS match score
  const lastAtsKeyRef = useRef('')
  const atsAbortRef = useRef(null)

  const handleCalculateAts = async (resume, jd) => {
    if (!resume || !jd) return
    const key = resume + '|' + jd
    if (key === lastAtsKeyRef.current) return
    lastAtsKeyRef.current = key

    atsAbortRef.current?.abort()
    const controller = new AbortController()
    atsAbortRef.current = controller

    setAtsCalculating(true)
    try {
      const response = await axios.post(`${API_BASE_URL}/admin/ats-score`, {
        resume_text: resume,
        jd_text: jd
      }, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = response.data
      setAtsScoreData({
        score: data.score || 0,
        summary: data.summary || '',
        matched_skills: data.matched_skills || [],
        missing_skills: data.missing_skills || []
      })
    } catch (e) {
      if (axios.isCancel(e) || e.code === 'ERR_CANCELED') return
      console.error("ATS score error:", e)
      Swal.fire({
        title: 'ATS Calculation Failed',
        text: 'Failed to calculate ATS match score.',
        icon: 'error',
        confirmButtonColor: '#6366f1'
      })
    } finally {
      if (atsAbortRef.current === controller) setAtsCalculating(false)
    }
  }

  // Debounce ATS score trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      if (singleCandidate.resumeText && singleCandidate.jobDescription) {
        handleCalculateAts(singleCandidate.resumeText, singleCandidate.jobDescription)
      }
    }, 600)
    return () => clearTimeout(timer)
  }, [singleCandidate.resumeText, singleCandidate.jobDescription])

  // Email template builder and editor sync
  const buildEmailHtml = (overrideBody) => {
    const { headHtml, bodyAttributes, bodyInnerHtml } = emailTemplate
    const attrs = Object.entries(bodyAttributes || {})
      .map(([key, value]) => `${key}="${String(value).replace(/"/g, '&quot;')}"`)
      .join(' ')
    const content = overrideBody !== undefined ? overrideBody : bodyInnerHtml
    return `<!DOCTYPE html><html><head>${headHtml || ''}</head><body ${attrs}>${content || ''}</body></html>`
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

      const formattedJd = String(jd || '').replace(/\n/g, '<br/>')
      const compiledBodyInnerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Interview Invitation</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f0f4f8;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background-color:#4f46e5;border-radius:12px 12px 0 0;padding:28px 40px;text-align:left;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td>
                <span style="display:inline-block;background:rgba(255,255,255,0.15);border-radius:8px;padding:6px 14px;font-size:13px;font-weight:700;color:#c7d2fe;letter-spacing:0.08em;text-transform:uppercase;">Hire IQ Platform</span>
                <h1 style="margin:14px 0 0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.03em;line-height:1.2;">You've Been Invited<br/>to an AI Interview</h1>
              </td>
              <td style="text-align:right;vertical-align:top;"><div style="width:48px;height:48px;background:rgba(255,255,255,0.18);border-radius:12px;font-size:24px;line-height:48px;text-align:center;">🎯</div></td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="background:linear-gradient(90deg,#6366f1,#8b5cf6,#4f46e5);height:3px;"></td></tr>
        <tr>
          <td style="background:#ffffff;padding:40px 40px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;">
            <p style="margin:0 0 8px;font-size:17px;color:#0f172a;font-weight:600;">Dear ${name},</p>
            <p style="margin:0 0 28px;font-size:14px;color:#64748b;line-height:1.7;">Congratulations! You have been selected for an AI-powered interview. Please review the details below and click the button to begin when you're ready.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #6366f1;border-radius:8px;margin-bottom:20px;">
              <tr><td style="padding:20px 24px;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.1em;">📋 Role Details</p>
                <p style="margin:0;font-size:14px;color:#475569;line-height:1.6;">${formattedJd}</p>
              </td></tr>
            </table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;"><tr>
              <td width="50%" style="padding-right:8px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">⏱ Duration</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${duration} <span style="font-size:14px;color:#64748b;font-weight:500;">minutes</span></p>
                </div>
              </td>
              <td width="50%" style="padding-left:8px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.08em;">📡 Format</p>
                  <p style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">AI <span style="font-size:14px;color:#64748b;font-weight:500;">Adaptive</span></p>
                </div>
              </td>
            </tr></table>
            ${scheduleHtml || ''}
            <div style="text-align:center;margin:32px 0;">
              <a href="#" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:15px 44px;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.02em;">Begin My Interview →</a>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Button not working? <a href="#" style="color:#6366f1;text-decoration:underline;">Copy this link</a></p>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#fff8f8;border:1px solid #fecaca;border-top:none;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:24px 40px;">
            <p style="margin:0 0 14px;font-size:13px;font-weight:800;color:#b91c1c;text-transform:uppercase;letter-spacing:0.08em;">⚠️ Mandatory Interview Rules</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr><td style="padding:8px 0;border-bottom:1px solid #fee2e2;"><table cellspacing="0" cellpadding="0"><tr><td style="width:28px;vertical-align:top;font-size:16px;">🖥️</td><td style="font-size:13px;color:#7f1d1d;line-height:1.6;"><b>Full-Screen Only:</b> You must remain in full-screen mode. Exiting or switching tabs is flagged as a violation.</td></tr></table></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #fee2e2;"><table cellspacing="0" cellpadding="0"><tr><td style="width:28px;vertical-align:top;font-size:16px;">📷</td><td style="font-size:13px;color:#7f1d1d;line-height:1.6;"><b>Camera Active:</b> AI-powered face tracking and multi-face detection will be active throughout the session.</td></tr></table></td></tr>
              <tr><td style="padding:8px 0;border-bottom:1px solid #fee2e2;"><table cellspacing="0" cellpadding="0"><tr><td style="width:28px;vertical-align:top;font-size:16px;">🔇</td><td style="font-size:13px;color:#7f1d1d;line-height:1.6;"><b>Quiet Environment:</b> Background noise or additional voices may negatively impact your evaluation score.</td></tr></table></td></tr>
              <tr><td style="padding:8px 0;"><table cellspacing="0" cellpadding="0"><tr><td style="width:28px;vertical-align:top;font-size:16px;">📺</td><td style="font-size:13px;color:#7f1d1d;line-height:1.6;"><b>Screen Sharing:</b> You must share your entire screen during the session.</td></tr></table></td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#fffbeb;border:1px solid #fde68a;border-top:none;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0;padding:16px 40px;">
            <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">🔔 <b>Note:</b> Please join only during the scheduled time window. If no schedule is configured, the link is valid for <b>24 hours</b>. Ensure a stable internet connection before starting.</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border:1px solid #e2e8f0;border-top:3px solid #e2e8f0;border-radius:0 0 12px 12px;padding:24px 40px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
              <td><p style="margin:0 0 2px;font-size:14px;font-weight:700;color:#0f172a;">Hire IQ Recruitment Team</p><p style="margin:0;font-size:12px;color:#94a3b8;">Powered by AI Adaptive Interview Platform</p></td>
              <td style="text-align:right;vertical-align:middle;"><span style="font-size:11px;color:#cbd5e1;font-weight:500;">HIRE IQ</span></td>
            </tr></table>
          </td>
        </tr>
        <tr><td style="padding:20px 0;text-align:center;"><p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">This email was sent to you because you are a candidate in an interview process.<br/>If you believe this is an error, please disregard this email.</p></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()

      const plainText = `Dear {candidate_name},

Congratulations! You have been selected for an AI-powered interview. Please review the details below and click the button to begin when you're ready.

📋 Role Details:
{job_description}

[Start Interview Button]

⚠️ Mandatory Interview Guidelines
• Full-Screen Only: You must remain in full-screen mode. Exiting or switching tabs is flagged as a violation.
• Camera Active: AI-powered face tracking and multi-face detection will be active throughout the session.
• Quiet Environment: Background noise or additional voices may negatively impact your evaluation score.
• Screen Sharing: You must share your entire screen during the session.

{schedule_info}`

      setEmailTemplate({
        headHtml: doc.head ? doc.head.innerHTML : '',
        bodyAttributes,
        bodyInnerHtml: compiledBodyInnerHtml,
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
    const { name, email, resumeText, jobDescription, duration, interviewFormat, interviewType, industry, language, caseStudyCount, scheduledStart, scheduledEnd, recordVideo, voiceCloning, hrScreening, customQuestions, aiInstructions } = singleCandidate

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
      const data = await dispatch(createSuperAdminInterview({
        candidate_name: name,
        candidate_email: email,
        resume_text: resumeText,
        resume_url: singleCandidate.resumeFileUrl || '',
        resume_filename: singleCandidate.resumeFileName || '',
        job_description: jobDescription,
        admin_id: adminUser?.admin_id || adminUser?.id || adminUser?._id || 'admin',
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
        custom_questions: Array.isArray(customQuestions) ? customQuestions.join('\n') : customQuestions,
        ai_instructions: Array.isArray(aiInstructions) ? aiInstructions.join('\n') : aiInstructions,
        case_study_count: interviewType === 'Non-Technical' ? Number(caseStudyCount) : 0,
        voice_clone: voiceCloning,
        custom_voice_id: singleCandidate.customVoiceId || "",
        application_id: singleCandidate.applicationId || "",
        candidate_phone: singleCandidate.phone || "",
        experience: singleCandidate.experience || "",
        location: singleCandidate.location || "",
        current_ctc: singleCandidate.current_ctc || "",
        expected_ctc: singleCandidate.expected_ctc || "",
        current_company: singleCandidate.current_company || "",
        notice_period: singleCandidate.notice_period || "",
        ats_score: atsScoreData ? atsScoreData.score : null,
        jd_file_url: singleCandidate.jdFileUrl || null,
        job_id: singleCandidate.jobId || "",
        interview_title: singleCandidate.jobTitle || ""
      })).unwrap()

      let msg = `Secure interview link created successfully!`
      if (data.email_scheduled && data.email_send_at) {
        msg += `\nInvitation scheduled to send to ${email} at ${new Date(data.email_send_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}`
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
        jobDescription: '',
        customQuestions: '',
        aiInstructions: '',
        scheduledStart: '',
        scheduledEnd: ''
      }))
      setAtsScoreData(null)
      setCustomEmailHtml('')

      dispatch(loadSuperAdminDashboard())
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Session Creation Failed',
        text: e.detail || e.message || "Failed to create session.",
        icon: 'error',
        confirmButtonColor: '#ef4444'
      })
    } finally {
      setInviting(false)
    }
  }

  // Excel template downloader

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
      const data = await dispatch(createSuperAdminInterview({
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
        admin_id: adminUser?.admin_id || adminUser?.id || adminUser?._id || 'admin',
        interview_duration: Number(duration),
        record_video: recordVideo,
        custom_email_html: customEmailHtml || "",
        scheduled_start: toUtcIso(scheduledStart),
        scheduled_end: toUtcIso(scheduledEnd),
        hr_screening: hrScreening,
        custom_questions: Array.isArray(customQuestions) ? customQuestions.join('\n') : customQuestions,
        ai_instructions: Array.isArray(aiInstructions) ? aiInstructions.join('\n') : aiInstructions,
        voice_clone: bulkConfig.voiceCloning,
        custom_voice_id: bulkConfig.customVoiceId || "",
        jd_file_url: bulkConfig.jdFileUrl || null
      })).unwrap()

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
      dispatch(loadSuperAdminDashboard())
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Bulk Invitations Failed',
        text: e.detail || e.message || "Error sending bulk interviews.",
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
        <div className="flex flex-col gap-1.5 md:flex-row md:justify-between md:items-center bg-card p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 border border-indigo-400/30"
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
              }}
            >
              <i className="fas fa-file-signature text-xl text-white"></i>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-foreground tracking-tight">Create Interview Session</h2>
              <p className="text-xs text-muted-foreground font-medium">Configure settings, parse resumes, and invite candidates to AI-conducted adaptive interviews.</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher Capsule */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-[16px] gap-1.5 max-w-md mx-auto w-full border border-slate-200 dark:border-slate-700/50 shadow-sm relative overflow-hidden">
          <button
            type="button"
            onClick={() => setCreateTab('single')}
            style={createTab === 'single' ? { backgroundColor: '#4f46e5', color: '#ffffff' } : {}}
            className={`flex-1 py-2.5 px-4 rounded-[12px] font-extrabold text-xs cursor-pointer transition-all duration-300 outline-none flex items-center justify-center gap-2 z-10 ${createTab === 'single'
              ? '!bg-indigo-600 !text-white shadow-md shadow-indigo-500/25'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
          >
            <i className="fas fa-user text-xs"></i> Single Candidate
          </button>
          <button
            type="button"
            onClick={() => setCreateTab('bulk')}
            style={createTab === 'bulk' ? { backgroundColor: '#4f46e5', color: '#ffffff' } : {}}
            className={`flex-1 py-2.5 px-4 rounded-[12px] font-extrabold text-xs cursor-pointer transition-all duration-300 outline-none flex items-center justify-center gap-2 z-10 ${createTab === 'bulk'
              ? '!bg-indigo-600 !text-white shadow-md shadow-indigo-500/25'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`}
          >
            <i className="fas fa-users text-xs"></i> Bulk Send
          </button>
        </div>

        {/* Single candidate panel */}
        {/* Tab Panels */}
        <React.Suspense fallback={
          <div className="p-12 text-center text-slate-500 dark:text-slate-400 font-semibold flex items-center justify-center gap-2">
            <i className="fas fa-circle-notch fa-spin text-primary"></i> Loading tab content...
          </div>
        }>
          {createTab === 'single' && (
            <CreateInterviewSingleTab
              singleCandidate={singleCandidate}
              setSingleCandidate={setSingleCandidate}
              handleSingleChange={handleSingleChange}
              handleSingleHrChange={handleSingleHrChange}
              callLogs={callLogs}
              resumeParsing={resumeParsing}
              setResumeParsing={setResumeParsing}
              jdParsing={jdParsing}
              setJdParsing={setJdParsing}
              customQuestionsParsing={customQuestionsParsing}
              setCustomQuestionsParsing={setCustomQuestionsParsing}
              aiInstructionsParsing={aiInstructionsParsing}
              setAiInstructionsParsing={setAiInstructionsParsing}
              atsCalculating={atsCalculating}
              atsScoreData={atsScoreData}
              handleCalculateAts={handleCalculateAts}
              handleCheckCandidate={handleCheckCandidate}
              handleParseFile={handleParseFile}
              handleGenerateInterviewLink={handleGenerateInterviewLink}
              handlePreviewEmail={handlePreviewEmail}
              inviting={inviting}
              availableVoices={availableVoices}
              hasCustomScreening={hasCustomScreening}
              hasCustomAIInstructions={hasCustomAIInstructions}
              hasIndustry={hasIndustry}
              singleCreatedLinks={singleCreatedLinks}
            />
          )}

          {createTab === 'bulk' && (
            <CreateInterviewBulkTab
              bulkConfig={bulkConfig}
              handleBulkConfigChange={handleBulkConfigChange}
              handleBulkHrChange={handleBulkHrChange}
              bulkCandidates={bulkCandidates}
              setBulkCandidates={setBulkCandidates}
              bulkJdParsing={bulkJdParsing}
              setBulkJdParsing={setBulkJdParsing}
              bulkCustomQuestionsParsing={bulkCustomQuestionsParsing}
              setBulkCustomQuestionsParsing={setBulkCustomQuestionsParsing}
              bulkAiInstructionsParsing={bulkAiInstructionsParsing}
              setBulkAiInstructionsParsing={setBulkAiInstructionsParsing}
              handleParseFile={handleParseFile}
              availableVoices={availableVoices}
              hasCustomScreening={hasCustomScreening}
              hasCustomAIInstructions={hasCustomAIInstructions}
              hasIndustry={hasIndustry}
              inviting={inviting}
              handleSendBulkInterviews={handleSendBulkInterviews}
              handlePreviewEmail={handlePreviewEmail}
            />
          )}
        </React.Suspense>
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
