import React, { useState } from 'react'
import Swal from 'sweetalert2'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Textarea from '../../components/Textarea'
import Select from '../../components/Select'
import { CustomToggleSwitch, FeatureLockOverlay } from './CreateInterviewShared'

export default function CreateInterviewBulkTab({
  bulkConfig,
  handleBulkConfigChange,
  handleBulkHrChange,
  bulkCandidates = [],
  setBulkCandidates,
  bulkJdParsing,
  setBulkJdParsing,
  bulkCustomQuestionsParsing,
  setBulkCustomQuestionsParsing,
  bulkAiInstructionsParsing,
  setBulkAiInstructionsParsing,
  handleParseFile,
  availableVoices = [],
  hasCustomScreening,
  hasCustomAIInstructions,
  hasIndustry,
  inviting,
  handleSendBulkInterviews,
  handlePreviewEmail,
}) {
  const [bulkCandidateInput, setBulkCandidateInput] = useState({ name: '', email: '' })
  const [bulkCsvLabel, setBulkCsvLabel] = useState('Click to upload or drag and drop Excel or CSV template')

  const [newBulkQuestion, setNewBulkQuestion] = useState('')
  const [newBulkInstruction, setNewBulkInstruction] = useState('')

  const [editingBulkQuestionIndex, setEditingBulkQuestionIndex] = useState(null)
  const [editingBulkQuestionText, setEditingBulkQuestionText] = useState('')
  const [editingBulkInstructionIndex, setEditingBulkInstructionIndex] = useState(null)
  const [editingBulkInstructionText, setEditingBulkInstructionText] = useState('')

  const addBulkQuestion = () => {
    if (!newBulkQuestion.trim()) return
    handleBulkConfigChange('customQuestions', [...(bulkConfig.customQuestions || []), newBulkQuestion.trim()])
    setNewBulkQuestion('')
  }
  const deleteBulkQuestion = (index) => {
    handleBulkConfigChange('customQuestions', (bulkConfig.customQuestions || []).filter((_, i) => i !== index))
  }

  const addBulkInstruction = () => {
    if (!newBulkInstruction.trim()) return
    handleBulkConfigChange('aiInstructions', [...(bulkConfig.aiInstructions || []), newBulkInstruction.trim()])
    setNewBulkInstruction('')
  }
  const deleteBulkInstruction = (index) => {
    handleBulkConfigChange('aiInstructions', (bulkConfig.aiInstructions || []).filter((_, i) => i !== index))
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

  return (
    <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Requirements & Material Details (Col Span 6) */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Card 1: Requirement Documents */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-border pb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-file-invoice text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Job Description Profile</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Provide description to target questions dynamically</p>
                  </div>
                </div>

                {/* Job Description (Bulk) */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 m-0">Job Description <span className="text-rose-500">*</span></label>
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
                            if (data.text) {
                              handleBulkConfigChange('jobDescription', data.text)
                            }
                            if (data.file_url) {
                              handleBulkConfigChange('jdFileUrl', data.file_url)
                            }
                          }
                        }, setBulkJdParsing, 'jd', true)
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
                <FeatureLockOverlay isLocked={!hasCustomScreening} featureName="Custom Screening Questions">
<div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/60/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-question-circle text-primary"></i> Custom Screening Questions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white dark:bg-slate-800/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">Provide pre-defined questions that the AI will ask first</span>
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
                              const lines = (data.text || '')
                                .split('\n')
                                .map(line => line.trim())
                                .filter(Boolean);
                              handleBulkConfigChange('customQuestions', [...(bulkConfig.customQuestions || []), ...lines])
                            }
                          }, setBulkCustomQuestionsParsing)
                        }}
                      />
                    </div>
                    {bulkCustomQuestionsParsing && (
                      <span className="text-xs text-warning font-semibold mt-1 block">
                        <i className="fas fa-spinner fa-spin mr-1"></i> Parsing questions file...
                      </span>
                    )}
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        placeholder="Add a custom screening question..."
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-4 py-2.5 text-slate-900 dark:text-white text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white dark:bg-slate-800/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400"
                        value={newBulkQuestion}
                        onChange={(e) => setNewBulkQuestion(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addBulkQuestion();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={addBulkQuestion}
                        className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-[5px] transition-colors cursor-pointer"
                        style={{ backgroundColor: '#6366f1' }}
                      >
                        Add
                      </button>
                    </div>
                    {bulkConfig.customQuestions && bulkConfig.customQuestions.length > 0 && (
                      <ol className="list-decimal pl-5 flex flex-col gap-2 mt-2 max-h-60 overflow-y-auto">
                        {bulkConfig.customQuestions.map((q, idx) => (
                          <li key={idx} className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                            {editingBulkQuestionIndex === idx ? (
                              <div className="flex gap-2 items-center w-full">
                                <input
                                  type="text"
                                  className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-3 py-1.5 text-slate-900 dark:text-white text-sm outline-none focus:border-primary focus:bg-white dark:bg-slate-800/60"
                                  value={editingBulkQuestionText}
                                  onChange={(e) => setEditingBulkQuestionText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (editingBulkQuestionText.trim()) {
                                        const updated = [...bulkConfig.customQuestions];
                                        updated[idx] = editingBulkQuestionText.trim();
                                        handleBulkConfigChange('customQuestions', updated);
                                      }
                                      setEditingBulkQuestionIndex(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingBulkQuestionIndex(null);
                                    }
                                  }}
                                  autoFocus
                                  onBlur={() => setEditingBulkQuestionIndex(null)}
                                />
                              </div>
                            ) : (
                              <div className="flex justify-between items-start gap-4 group" onDoubleClick={() => { setEditingBulkQuestionIndex(idx); setEditingBulkQuestionText(bulkConfig.customQuestions[idx]); }}>
                                <span className="break-all">{q}</span>
                                <button
                                  type="button"
                                  onClick={() => deleteBulkQuestion(idx)}
                                  className="text-rose-500 hover:text-rose-700 transition-colors p-1 cursor-pointer flex-shrink-0 bg-transparent border-none"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
</FeatureLockOverlay>

                {/* AI Instructions Section (Bulk) */}
                <FeatureLockOverlay isLocked={!hasCustomAIInstructions} featureName="Custom AI Interviewer Instructions">
<div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/60/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-robot text-primary"></i> Custom AI Interviewer Instructions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white dark:bg-slate-800/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">Provide behavioral rules or focus topics to guide the AI</span>
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
                              const lines = (data.text || '')
                                .split('\n')
                                .map(line => line.trim())
                                .filter(Boolean);
                              handleBulkConfigChange('aiInstructions', [...(bulkConfig.aiInstructions || []), ...lines])
                            }
                          }, setBulkAiInstructionsParsing)
                        }}
                      />
                    </div>
                    {bulkAiInstructionsParsing && (
                      <span className="text-xs text-warning font-semibold mt-1 block">
                        <i className="fas fa-spinner fa-spin mr-1"></i> Parsing instructions file...
                      </span>
                    )}
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        placeholder="Add a custom interviewer instruction..."
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-4 py-2.5 text-slate-900 dark:text-white text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white dark:bg-slate-800/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400"
                        value={newBulkInstruction}
                        onChange={(e) => setNewBulkInstruction(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addBulkInstruction();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={addBulkInstruction}
                        className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-[5px] transition-colors cursor-pointer"
                        style={{ backgroundColor: '#6366f1' }}
                      >
                        Add
                      </button>
                    </div>
                    {bulkConfig.aiInstructions && bulkConfig.aiInstructions.length > 0 && (
                      <ol className="list-decimal pl-5 flex flex-col gap-2 mt-2 max-h-60 overflow-y-auto">
                        {bulkConfig.aiInstructions.map((inst, idx) => (
                          <li key={idx} className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                            {editingBulkInstructionIndex === idx ? (
                              <div className="flex gap-2 items-center w-full">
                                <input
                                  type="text"
                                  className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-3 py-1.5 text-slate-900 dark:text-white text-sm outline-none focus:border-primary focus:bg-white dark:bg-slate-800/60"
                                  value={editingBulkInstructionText}
                                  onChange={(e) => setEditingBulkInstructionText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (editingBulkInstructionText.trim()) {
                                        const updated = [...bulkConfig.aiInstructions];
                                        updated[idx] = editingBulkInstructionText.trim();
                                        handleBulkConfigChange('aiInstructions', updated);
                                      }
                                      setEditingBulkInstructionIndex(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingBulkInstructionIndex(null);
                                    }
                                  }}
                                  autoFocus
                                  onBlur={() => setEditingBulkInstructionIndex(null)}
                                />
                              </div>
                            ) : (
                              <div className="flex justify-between items-start gap-4 group" onDoubleClick={() => { setEditingBulkInstructionIndex(idx); setEditingBulkInstructionText(bulkConfig.aiInstructions[idx]); }}>
                                <span className="break-all">{inst}</span>
                                <button
                                  type="button"
                                  onClick={() => deleteBulkInstruction(idx)}
                                  className="text-rose-500 hover:text-rose-700 transition-colors p-1 cursor-pointer flex-shrink-0 bg-transparent border-none"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
</FeatureLockOverlay>
              </div>
{/* Card 5: Excel/CSV Upload Dropzone */}
              <div className="bg-white dark:bg-slate-800/60/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 dark:text-slate-100 flex flex-col gap-4 shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-350 transition-all duration-200">
                <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-file-excel text-emerald-650 text-sm"></i>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 m-0">Import Candidates</label>
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
                  className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-6 text-center cursor-pointer bg-slate-50 dark:bg-slate-900/50/50 hover:bg-white dark:bg-slate-800/60 hover:border-emerald-500/80 hover:shadow-md hover:shadow-emerald-500/5 hover:-translate-y-0.5 transition-all duration-300 flex flex-col items-center justify-center gap-2 group"
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
              <div className="bg-white dark:bg-slate-800/60/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 dark:text-slate-100 flex flex-col gap-4 shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-350 transition-all duration-200">
                <div className="flex gap-2 items-center border-b border-slate-100 dark:border-slate-800 pb-2.5">
                  <i className="fas fa-user-plus text-primary text-xs"></i>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 m-0">Add Candidate Manually</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
                  <Input
                    label="Candidate Name"
                    placeholder="John Doe"
                    value={bulkCandidateInput.name}
                    onChange={(e) => setBulkCandidateInput(prev => ({ ...prev, name: e.target.value.replace(/[0-9]/g, '') }))}
                  />
                  <Input
                    label="Candidate Email"
                    placeholder="john@example.com"
                    value={bulkCandidateInput.email}
                    onChange={(e) => setBulkCandidateInput(prev => ({ ...prev, email: e.target.value }))}
                  />
                  <button
                    type="button"
                    style={{ backgroundColor: '#4f46e5', color: '#ffffff', borderColor: '#4338ca' }}
                    className="px-6 py-2.5 h-[42px] rounded-lg font-bold shadow-md hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer shrink-0 flex items-center justify-center gap-1.5 text-sm"
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
                  </button>
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

            {/* Right Column: Settings, Candidates & Submission (Col Span 6) */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Card 1: Configuration */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-border pb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-sliders text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Interview Settings (Bulk)</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Parameters apply globally to all candidates</p>
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
                    options={['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam']}
                  />

                  <Input
                    label="Duration (Minutes)"
                    type="number"
                    min="5"
                    max="120"
                    value={bulkConfig.duration}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val !== '') {
                        val = parseInt(val);
                        if (val > 120) val = 120;
                      }
                      handleBulkConfigChange('duration', val)
                    }}
                  />

                  <FeatureLockOverlay isLocked={!hasIndustry} featureName="Industry Type">
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
</FeatureLockOverlay>

                  {bulkConfig.interviewType === 'Non-Technical' && (
                    <div className="sm:col-span-2">
                      <Select
                        label="Number of Case Study Questions (Round 2)"
                        value={bulkConfig.caseStudyCount}
                        onChange={(e) => handleBulkConfigChange('caseStudyCount', parseInt(e.target.value))}
                        options={[
                          { value: '1', label: '1 Question' },
                          { value: '2', label: '2 Questions' },
                          { value: '3', label: '3 Questions' }
                        ]}
                      />
                    </div>
                  )}
                </div>
              </Card>

              {/* Card 2: Scheduling Options (Bulk) */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-border pb-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-calendar-check text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Interview Schedule</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Global access window restrictions</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Start Date & Time"
                    type="datetime-local"
                    value={bulkConfig.scheduledStart}
                    max={bulkConfig.scheduledEnd || undefined}
                    onChange={(e) => handleBulkConfigChange('scheduledStart', e.target.value)}
                  />
                  <Input
                    label="End Date & Time"
                    type="datetime-local"
                    value={bulkConfig.scheduledEnd}
                    min={bulkConfig.scheduledStart || undefined}
                    onChange={(e) => handleBulkConfigChange('scheduledEnd', e.target.value)}
                  />
                </div>
                <div className="flex gap-2.5 items-start bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-150 mt-1">
                  <i className="fas fa-circle-info text-indigo-500 text-xs mt-0.5"></i>
                  <p className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-normal font-medium">
                    Leave dates empty for immediate access. Configured values enforce global timing access for all candidates.
                  </p>
                </div>
              </Card>

              {/* Card 3: Camera Video Options (Bulk) */}
              <div className="bg-card border border-border rounded-2xl p-5 text-foreground flex justify-between items-center shadow-sm hover:border-slate-300 transition-all duration-200">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-video text-sm text-white"></i>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="bulkRecordVideo" className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 cursor-pointer">
                      Record Interview Video
                    </label>
                    <span className="text-[0.7rem] text-slate-400 font-medium">Webcam video recording default for all bulk candidates</span>
                  </div>
                </div>
                <CustomToggleSwitch
                  checked={bulkConfig.recordVideo}
                  onChange={(val) => handleBulkConfigChange('recordVideo', val)}
                />
              </div>

              {/* Card 3b: Voice Cloning (Bulk) */}
              <div className="bg-white dark:bg-slate-800/60/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 dark:text-slate-100 flex flex-col gap-4 shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-300 transition-all duration-200">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-transparent border-none overflow-hidden shrink-0">
                      <img src="/voice-cloning-logo.svg" alt="Voice Cloning Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label htmlFor="bulkVoiceCloning" className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 cursor-pointer">
                        Voice Cloning
                      </label>
                      <span className="text-[0.7rem] text-slate-400 font-medium">AI will speak in a custom Cartesia voice</span>
                    </div>
                  </div>
                  <CustomToggleSwitch
                    checked={bulkConfig.voiceCloning}
                    onChange={(val) => handleBulkConfigChange('voiceCloning', val)}
                  />
                </div>

                {bulkConfig.voiceCloning && (
                  <div className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">Select Voice</label>
                    <Select
                      options={[
                        { value: '', label: 'Default Cartesia Voice' },
                        ...availableVoices.map(v => ({ value: v.id, label: v.name }))
                      ]}
                      value={bulkConfig.customVoiceId || ''}
                      onChange={(e) => handleBulkConfigChange('customVoiceId', e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Card 4: HR Screening Parameters (Bulk toggles) */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-border pb-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-clipboard-question text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">HR Screening Questions</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Collect candidate preferences (Optional)</p>
                  </div>
                </div>

                <p className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-normal mb-1 font-medium">
                  AI will query preferences at the end of each session.
                </p>

                <div className="flex flex-col gap-3">
                  {/* Work Mode */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="bulkAskWorkMode" className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-building text-slate-400 text-xs"></i> Work Mode Preference
                      </label>
                      <CustomToggleSwitch
                        checked={bulkConfig.hrScreening.askWorkMode}
                        onChange={(val) => handleBulkHrChange('askWorkMode', val)}
                      />
                    </div>
                    {bulkConfig.hrScreening.askWorkMode && (
                      <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 flex-wrap">
                        {['On-site', 'Remote', 'Hybrid'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleBulkHrChange('workModeType', mode)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${bulkConfig.hrScreening.workModeType === mode
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
                              }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="bulkAskLocation" className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-map-location-dot text-slate-400 text-xs"></i> Location Check
                      </label>
                      <CustomToggleSwitch
                        checked={bulkConfig.hrScreening.askLocation}
                        onChange={(val) => handleBulkHrChange('askLocation', val)}
                      />
                    </div>
                    {bulkConfig.hrScreening.askLocation && (
                      <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 flex-wrap">
                        {['Current', 'Preferred'].map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handleBulkHrChange('locationType', loc)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${bulkConfig.hrScreening.locationType === loc
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
                              }`}
                          >
                            {loc === 'Current' ? 'Current Location' : 'Preferred Location'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bond */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50/50 flex justify-between items-center">
                    <label htmlFor="bulkAskBond" className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
                      <i className="fas fa-file-signature text-slate-400 text-xs"></i> Bond / Notice Period Info
                    </label>
                    <CustomToggleSwitch
                      checked={bulkConfig.hrScreening.askBond}
                      onChange={(val) => handleBulkHrChange('askBond', val)}
                    />
                  </div>
                </div>
              </Card>
            </div>
          </div>


          <Card className="bg-white dark:bg-slate-800/60/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 dark:text-slate-100 flex flex-col gap-4 mt-2">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
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
              <div className="p-8 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-center text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-2 bg-slate-50 dark:bg-slate-900/50/20">
                <i className="fas fa-users-slash text-2xl opacity-60"></i>
                <p>No candidates added yet. Upload Excel/CSV template or add manually.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[#e2e8f0] rounded-xl bg-white dark:bg-slate-800/60 shadow-sm">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-[#e2e8f0]">
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Candidate Name</th>
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email Address</th>
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[140px]">Record Video</th>
                      <th className="py-3.5 px-4 font-bold text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider w-[80px] text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkCandidates.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-primary text-[0.6rem] font-bold flex items-center justify-center">
                            {c.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                          {c.name}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-medium">{c.email}</td>
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
                            <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 border border-slate-400 dark:border-slate-600 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-primary"></div>
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

    </>
  )
}
