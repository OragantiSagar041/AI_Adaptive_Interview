import React, { useState, useRef, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Video, Volume2, ArrowRight, ShieldAlert, Cpu, AlertTriangle, RefreshCw } from 'lucide-react'
import { useInterviewSession } from './useInterviewSession'
import DeviceCheckModal from '../../components/DeviceCheckModal'
import { API_BASE_URL } from '../../apiConfig'
import api from '../../utils/api'
import '../../Interview.css'

export const InterviewTechnical = () => {
  const interviewType = 'Technical';

  const startRoundTwo = async ({
    verbalQuestionsLength,
    savedIndex,
    interviewId,
    setQuestions,
    setCurrentQuestionIndex,
    setCodingRoundLoading,
    setCodingRoundData,
    setSelectedLanguage,
    setCodeAnswer
  }) => {
    setCodingRoundLoading(true)
    try {
      const payload = await api.post(`/coding-round/start`, { interview_id: interviewId }).then(r => r.data)

      const task = payload.coding_round?.task || {}
      const recommendedLang = task.recommended_language || 'python'
      setSelectedLanguage(recommendedLang)
      setCodingRoundData(payload)

      const constraintsText = (task.constraints || []).join(' | ')
      const questionText = [
        `🖥️ CODING ROUND — ${task.title || 'Coding Challenge'}`,
        '',
        task.description || '',
        task.input_format ? `\nInput: ${task.input_format}` : '',
        task.output_format ? `Output: ${task.output_format}` : '',
        constraintsText ? `\nConstraints: ${constraintsText}` : '',
      ].filter(Boolean).join('\n')

      const codingQ = {
        id: verbalQuestionsLength + 1,
        text: questionText,
        question: questionText,
        type: 'coding',
        category: 'Coding',
        difficulty: task.difficulty || 'Medium',
        title: task.title,
        description: task.description,
        input_format: task.input_format,
        constraints: task.constraints,
        output_format: task.output_format,
        examples: task.examples,
        codingTask: task,
        codingTests: payload.tests || []
      }
      setQuestions(prev => [...prev, codingQ])
      
      const targetIndex = (savedIndex !== null && savedIndex >= verbalQuestionsLength) ? savedIndex : verbalQuestionsLength
      setCurrentQuestionIndex(targetIndex)
    } catch (err) {
      console.error('Coding round start failed:', err)
      throw err
    } finally {
      setCodingRoundLoading(false)
    }
  }

  const renderRoundTwoUI = (session) => {
    const {
      globalCountdown,
      compiling,
      setCompiling,
      activeRightTab,
      setActiveRightTab,
      selectedLanguage,
      setSelectedLanguage,
      codeAnswer,
      setCodeAnswer,
      activeConsoleTab,
      setActiveConsoleTab,
      runResultData,
      setRunResultData,
      evaluatedCount,
      selectedTestCase,
      setSelectedTestCase,
      codeOutput,
      setCodeOutputState,
      consoleOutput,
      setConsoleOutput,
      codingTask,
      codingRoundData,
      transcriptionText,
      interviewId,
      sessionDetail,
      sessionId,
      handleSubmitInterview,
      showDeviceCheck,
      setShowDeviceCheck,
      promptScreenShare
    } = session

    const handleRunCode = async () => {
      if (compiling) return
      setCompiling(true)
      setCodeOutputState("Compiling and executing code...")
      setRunResultData(null)
      setConsoleOutput(`Compiling and executing code...\nLanguage: ${selectedLanguage}\nRunning tests...`)

      const extractStdout = (code, lang) => {
        let outputs = []
        if (!code) return ""
        const lines = code.split('\n')

        if (lang === 'python') {
          for (let line of lines) {
            const match = line.match(/^\s*print\s*\(\s*(['"`])(.*?)\1\s*\)/)
            if (match) {
              outputs.push(match[2])
            } else {
              const simpleMatch = line.match(/^\s*print\s*\(\s*([a-zA-Z0-9_+\-*/\s]+)\s*\)/)
              if (simpleMatch) {
                const val = simpleMatch[1].trim()
                try {
                  if (/^[0-9\s+\-*/()]+$/.test(val)) {
                    outputs.push(Function(`return (${val})`)())
                  } else {
                    outputs.push(val)
                  }
                } catch (e) {
                  outputs.push(val)
                }
              }
            }
          }
        } else if (lang === 'javascript') {
          for (let line of lines) {
            const match = line.match(/^\s*console\.log\s*\(\s*(['"`])(.*?)\1\s*\)/)
            if (match) {
              outputs.push(match[2])
            } else {
              const simpleMatch = line.match(/^\s*console\.log\s*\(\s*([a-zA-Z0-9_+\-*/\s()]+)\s*\)/)
              if (simpleMatch) {
                const val = simpleMatch[1].trim()
                try {
                  if (/^[0-9\s+\-*/()]+$/.test(val)) {
                    outputs.push(Function(`return (${val})`)())
                  } else {
                    outputs.push(val)
                  }
                } catch (e) {
                  outputs.push(val)
                }
              }
            }
          }
        } else if (lang === 'cpp') {
          for (let line of lines) {
            if (line.includes("cout")) {
              const matches = [...line.matchAll(/(?:<<\s*)(?:(["'`])(.*?)\1|([a-zA-Z0-9_+\-*/\s()]+))/g)]
              let lineOutput = ""
              for (let m of matches) {
                const strVal = m[2]
                const rawVal = m[3]
                if (strVal !== undefined) {
                  lineOutput += strVal
                } else if (rawVal !== undefined) {
                  const trimmed = rawVal.trim()
                  if (trimmed !== "endl" && trimmed !== "std::endl") {
                    try {
                      if (/^[0-9\s+\-*/()]+$/.test(trimmed)) {
                        lineOutput += Function(`return (${trimmed})`)()
                      } else {
                        lineOutput += trimmed
                      }
                    } catch (e) {
                      lineOutput += trimmed
                    }
                  }
                }
              }
              if (lineOutput) {
                outputs.push(lineOutput)
              }
            }
          }
        }
        return outputs.length > 0 ? outputs.join('\n') : null
      }

      const iid = interviewId || sessionDetail?.interview_id || sessionId
      let errorText = null

      if (selectedLanguage === 'javascript') {
        try {
          new Function(codeAnswer)
        } catch (err) {
          errorText = `SyntaxError: ${err.message}`
        }
      } else if (selectedLanguage === 'python') {
        let count = 0
        for (let i = 0; i < codeAnswer.length; i++) {
          if (codeAnswer[i] === '(') count++
          if (codeAnswer[i] === ')') count--
          if (count < 0) {
            errorText = `SyntaxError: Unmatched closing parenthesis ')' at index ${i}`
            break
          }
        }
        if (count > 0 && !errorText) {
          errorText = "SyntaxError: Unmatched opening parenthesis '(' (parenthesis was never closed)"
        }
      }

      const userStdout = extractStdout(codeAnswer, selectedLanguage)

      if (errorText) {
        setCodeOutputState(`Code Execution Result:\n❌ Execution Failed / Syntax Error\n\nError:\n${errorText}`)
        setConsoleOutput(`Current Output:\n\nError:\n${errorText}`)
        setCompiling(false)
        return
      }

      try {
        const payload = await api.post(`/coding-round/run`, {
          interview_id: iid,
          code: codeAnswer,
          language: selectedLanguage,
          explanation: transcriptionText
        }).then(r => r.data)

        setRunResultData(payload.run_result || null)

        let passedOutputStr = "Code Execution Result:\n";
        let executionError = payload?.run_result?.runtime_error || payload?.run_result?.compiler_error || '';

        const totalTests = codingRoundData?.coding_round?.task?.test_cases?.length || 14;
        let realTestOutput = '';

        if (executionError) {
          realTestOutput = `❌ Execution Error\nPassed 0 / ${totalTests} Test Cases\n\nError:\n${executionError}\n\n--------------------------------------------------\n\n`;
        } else if (payload?.run_result?.visible_results?.length) {
          const passedCount = payload.run_result.visible_results.filter(r => r.passed).length + (payload.run_result.hidden_summary?.passed || 0);
          const allPassed = passedCount === totalTests;

          realTestOutput = `${allPassed ? '✅ All Tests Passed!' : '❌ Some Tests Failed'}\nPassed ${passedCount} / ${totalTests} Test Cases\n\n`;
          realTestOutput += payload.run_result.visible_results.map(r =>
            `Test ${r.id} (Visible): ${r.passed ? 'PASSED ✅' : 'FAILED ❌'}\nInput: ${JSON.stringify(r.input)}\nExpected: ${JSON.stringify(r.expected)}\nGot: ${JSON.stringify(r.output)}`
          ).join('\n\n');

          if (payload.run_result.hidden_summary) {
            realTestOutput += `\n\nHidden Tests: ${payload.run_result.hidden_summary.passed} / ${payload.run_result.hidden_summary.total} Passed`;
          }
          realTestOutput += "\n\n--------------------------------------------------\n\n";
        } else if (payload?.run_result?.output) {
          realTestOutput = `Output:\n${payload.run_result.output}\n\n--------------------------------------------------\n\n`;
        } else {
          realTestOutput = `No output\n\n--------------------------------------------------\n\n`;
        }
        passedOutputStr += realTestOutput;

        const isNativeDisabled = payload?.run_result?.runtime_error?.includes("Native code execution is disabled")
        if (isNativeDisabled) {
          setCodeOutputState("Native runner is unavailable. Getting AI feedback on your solution instead...")

          const aiPayload = await api.post(`/coding-round/checkpoint`, {
            interview_id: iid,
            code: codeAnswer,
            language: selectedLanguage,
            explanation: transcriptionText
          }).then(r => r.data)

          const fb = aiPayload.feedback
          if (fb && typeof fb === 'object') {
            let formattedFeedback = "AI Code Evaluation Feedback:\n\n"
            if (fb.coach_message) {
              formattedFeedback += `Coach Message:\n${fb.coach_message}\n\n`
            }
            if (fb.strengths && fb.strengths.length > 0) {
              formattedFeedback += `Strengths:\n${fb.strengths.map(s => `• ${s}`).join('\n')}\n\n`
            }
            if (fb.risks && fb.risks.length > 0) {
              formattedFeedback += `Risks/Concerns:\n${fb.risks.map(r => `• ${r}`).join('\n')}\n\n`
            }
            if (fb.next_steps && fb.next_steps.length > 0) {
              formattedFeedback += `Next Steps:\n${fb.next_steps.map(n => `• ${n}`).join('\n')}\n\n`
            }
            if (fb.scorecard) {
              formattedFeedback += `Scorecard:\n`
              formattedFeedback += `• Problem Understanding: ${fb.scorecard.problem_understanding ?? '--'}/100\n`
              formattedFeedback += `• Implementation: ${fb.scorecard.implementation ?? '--'}/100\n`
              formattedFeedback += `• Communication: ${fb.scorecard.communication ?? '--'}/100\n`
              formattedFeedback += `• Overall: ${fb.scorecard.overall ?? '--'}/100\n`
            }

            if (errorText) {
              setCodeOutputState(`Code Execution Result:\n❌ Some Tests Failed / Execution Error\n\nError:\n${errorText}\n\n--------------------------------------------------\n\n${formattedFeedback}`)
            } else {
              setCodeOutputState(passedOutputStr + formattedFeedback)
            }
          } else {
            if (errorText) {
              setCodeOutputState(`Code Execution Result:\n❌ Some Tests Failed / Execution Error\n\nError:\n${errorText}\n\n--------------------------------------------------\n\nAI Code Evaluation Feedback:\n\n${fb || 'No feedback details returned.'}`)
            } else {
              setCodeOutputState(passedOutputStr + `AI Code Evaluation Feedback:\n\n${fb || 'No feedback details returned.'}`)
            }
          }
          let simulatedConsoleOutput = `Current Output:\n${userStdout || ''}`
          if (errorText) {
            simulatedConsoleOutput += `\n\nError:\n${errorText}`
          }
          setConsoleOutput(simulatedConsoleOutput)
          return
        }

        const res = payload.run_result
        if (res?.compiler_error) {
          errorText = res.compiler_error
        } else if (res?.runtime_error) {
          errorText = res.runtime_error
        }

        setCodeOutputState(passedOutputStr.replace("\n\n--------------------------------------------------\n\n", ""))

        let simulatedConsoleOutput = `Current Output:\n${userStdout || res?.output || ''}`
        if (errorText) {
          simulatedConsoleOutput += `\n\nError:\n${errorText}`
        }
        setConsoleOutput(simulatedConsoleOutput)
      } catch (e) {
        errorText = e.message || "Network request failed."
        setCodeOutputState(`Code Execution Result:\n❌ Execution Failed\n\nError:\n${errorText}`)
        let simulatedConsoleOutput = `Current Output:\n${userStdout || ''}`
        if (errorText) {
          simulatedConsoleOutput += `\n\nError:\n${errorText}`
        }
        setConsoleOutput(simulatedConsoleOutput)
      } finally {
        setCompiling(false)
      }
    }

    const handleSubmitCodingAndInterview = async () => {
      const iid = interviewId || sessionDetail?.interview_id || sessionId
      try {
        await api.post(`/coding-round/submit`, {
          interview_id: iid,
          code: codeAnswer,
          explanation: codeAnswer,
          language: selectedLanguage
        })
      } catch (e) {
        console.error("Failed to submit coding answer:", e)
      }
      handleSubmitInterview(false)
    }

    return (
      <div id="codingRoundSection" className="coding-round-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', padding: '16px', boxSizing: 'border-box', overflow: 'hidden' }}>
        <div className="coding-round-header" style={{ marginBottom: '12px', flexShrink: 0 }}>
          <div>
            <p className="coding-round-kicker">Round 2</p>
            <h2>Live Coding Task</h2>
            <p>Round 2 has {Math.floor(globalCountdown / 60).toString().padStart(2, '0')}:{(globalCountdown % 60).toString().padStart(2, '0')} remaining. Explain your logic to the AI while you code.</p>
          </div>
          <div className="coding-round-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button className="ip-btn-prev" onClick={handleRunCode} disabled={compiling}>Get AI Feedback</button>
            <button className="ip-btn-next" onClick={handleSubmitCodingAndInterview}>Submit Code</button>
          </div>
        </div>

        <div className="coding-round-grid" style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: 'minmax(360px, 0.95fr) minmax(520px, 1.25fr)', gap: '16px', minHeight: '0', overflow: 'hidden' }}>
          <div className="coding-problem-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="coding-problem-topbar" style={{ flexShrink: 0 }}>
              <div className="coding-problem-tabs">
                <span className="coding-tab-pill active" style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#4b5563' }}>Description</span>
                <span className="coding-tab-pill" style={{ color: '#94a3b8' }}>Editorial Disabled</span>
              </div>
              <div className="coding-problem-meta" style={{ display: 'flex', gap: '8px' }}>
                <span className="question-difficulty" style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>Easy</span>
                <span className="question-type" style={{ background: '#e0e7ff', color: '#3730a3', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{selectedLanguage}</span>
              </div>
            </div>
            <div className="coding-problem-scroll" style={{ padding: '24px', flexGrow: 1, overflowY: 'auto', minHeight: '0', paddingBottom: '140px' }}>
              <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#2c3e50', marginBottom: '12px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                1. {codingTask.title || 'Technical Assessment'}
              </h3>
              <div style={{ height: '1px', backgroundColor: '#eef2f6', margin: '12px 0 20px 0' }}></div>

              {codingTask.description ? (
                <div style={{ color: '#3c4d57', fontSize: '14.5px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  <div style={{ marginBottom: '20px', whiteSpace: 'pre-line' }}>
                    {codingTask.description}
                  </div>

                  {codingTask.input_format && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '15px', marginTop: '20px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Input Format</h4>
                      <p style={{ margin: 0, color: '#3c4d57', fontSize: '14px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{codingTask.input_format}</p>
                    </div>
                  )}

                  {codingTask.constraints && (Array.isArray(codingTask.constraints) ? codingTask.constraints.length > 0 : true) && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '15px', marginTop: '20px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Constraints</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', color: '#3c4d57', fontSize: '14.5px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                        {Array.isArray(codingTask.constraints) ? (
                          codingTask.constraints.map((c, i) => (
                            <li key={i} style={{ marginBottom: '6px', fontStyle: c.includes('<=') || c.includes('≤') ? 'italic' : 'normal' }}>{c}</li>
                          ))
                        ) : (
                          <li style={{ marginBottom: '6px' }}>{codingTask.constraints}</li>
                        )}
                      </ul>
                    </div>
                  )}

                  {codingTask.output_format && (
                    <div style={{ marginBottom: '20px' }}>
                      <h4 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '15px', marginTop: '20px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Output Format</h4>
                      <p style={{ margin: 0, color: '#3c4d57', fontSize: '14px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{codingTask.output_format}</p>
                    </div>
                  )}

                  {codingTask.examples && codingTask.examples.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
                      {codingTask.examples.map((ex, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div>
                            <h5 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '14px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Sample Input {idx + 1}</h5>
                            <pre style={{ background: '#f3f7f9', padding: '12px 16px', borderRadius: '4px', fontSize: '13px', color: '#2c3e50', fontFamily: 'Consolas, Monaco, "Andale Mono", monospace', overflowX: 'auto', margin: 0, border: 'none', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                              {ex.input}
                            </pre>
                          </div>
                          <div>
                            <h5 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '14px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Sample Output {idx + 1}</h5>
                            <pre style={{ background: '#f3f7f9', padding: '12px 16px', borderRadius: '4px', fontSize: '13px', color: '#2c3e50', fontFamily: 'Consolas, Monaco, "Andale Mono", monospace', overflowX: 'auto', margin: 0, border: 'none', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                              {ex.output}
                            </pre>
                          </div>
                          {ex.explanation && (
                            <div style={{ marginBottom: '12px' }}>
                              <h5 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '14px', marginBottom: '4px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Explanation {idx + 1}</h5>
                              <p style={{ margin: 0, fontSize: '14px', color: '#3c4d57', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{ex.explanation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p style={{ color: '#475569', lineHeight: '1.6', marginBottom: '24px' }}>{codingTask.text || codingTask.question || ''}</p>
              )}

            </div>
          </div>

          <div className="coding-editor-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div className="coding-editor-topbar" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '0 16px', flexShrink: 0 }}>
              <div className="coding-right-tabs" style={{ display: 'flex', gap: '24px' }}>
                <button onClick={() => setActiveRightTab('code')} className={`coding-right-tab ${activeRightTab === 'code' ? 'active' : ''}`} style={activeRightTab === 'code' ? { borderBottom: '2px solid var(--primary-color)', color: 'var(--text-main)', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' } : { color: 'var(--text-muted)', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Code</button>
                <button onClick={() => { setActiveRightTab('testcase'); setActiveConsoleTab('results'); }} className={`coding-right-tab ${activeRightTab === 'testcase' ? 'active' : ''}`} style={activeRightTab === 'testcase' ? { borderBottom: '2px solid var(--primary-color)', color: 'var(--text-main)', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' } : { color: 'var(--text-muted)', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Testcase</button>
                <button onClick={() => { setActiveRightTab('result'); setActiveConsoleTab('results'); }} className={`coding-right-tab ${activeRightTab === 'result' ? 'active' : ''}`} style={activeRightTab === 'result' ? { borderBottom: '2px solid var(--primary-color)', color: 'var(--text-main)', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' } : { color: 'var(--text-muted)', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Result</button>
              </div>
            </div>

            <div className="coding-toolbar" style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--card-bg)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
              <label style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '600' }}>Language</label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid #cbd5e1', outline: 'none', background: '#fff', fontWeight: '500', color: 'var(--text-main)' }}
              >
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="cpp">C++</option>
              </select>
              <button className="ip-btn-next" style={{ padding: '8px 20px', marginLeft: 'auto' }} onClick={handleRunCode}>Run & Evaluate</button>
            </div>

            <div className="coding-editor-wrap" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '0', overflow: 'hidden' }}>
              <div className="coding-editor-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>Editor</h4>
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>Write your solution in the IDE below.</div>
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Autosave by language</div>
              </div>

              {activeRightTab === 'code' && (
                <textarea
                  className="coding-codebox"
                  spellCheck="false"
                  placeholder="// Write your solution here..."
                  value={codeAnswer}
                  onChange={(e) => setCodeAnswer(e.target.value)}
                  style={{ flexGrow: 1, width: '100%', border: 'none', outline: 'none', padding: '16px', fontFamily: 'monospace', fontSize: '14px', resize: 'none', background: '#fff', minHeight: '100px', overflowY: 'auto' }}
                ></textarea>
              )}

              <div className="coding-console-shell" style={{ borderTop: activeRightTab === 'code' ? '1px solid #e2e8f0' : 'none', background: '#f8fafc', display: 'flex', flexDirection: 'column', maxHeight: activeRightTab === 'code' ? '40%' : '100%', minHeight: activeRightTab === 'code' ? '160px' : '0', flexGrow: activeRightTab === 'code' ? 0 : 1 }}>
                <div className="coding-console-tabs" style={{ display: 'flex', gap: '2px', background: '#e2e8f0', padding: '8px 8px 0 8px', flexShrink: 0 }}>
                  <button
                    className={`coding-console-tab ${activeConsoleTab === 'results' ? 'active' : ''}`}
                    onClick={() => setActiveConsoleTab('results')}
                    style={{
                      background: activeConsoleTab === 'results' ? '#fff' : 'transparent',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px 8px 0 0',
                      fontWeight: '600',
                      color: activeConsoleTab === 'results' ? '#1e293b' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    Test Results
                  </button>
                  <button
                    className={`coding-console-tab ${activeConsoleTab === 'console' ? 'active' : ''}`}
                    onClick={() => setActiveConsoleTab('console')}
                    style={{
                      background: activeConsoleTab === 'console' ? '#fff' : 'transparent',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px 8px 0 0',
                      fontWeight: '600',
                      color: activeConsoleTab === 'console' ? '#1e293b' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    Console
                  </button>
                </div>
                <div className="coding-console-pane active" style={{ padding: '16px', background: '#fff', flexGrow: 1, overflowY: 'auto', minHeight: '0' }}>
                  {activeConsoleTab === 'results' ? (
                    <>
                      {runResultData ? (
                        <div className="flex flex-col w-full h-full text-slate-700 bg-white overflow-hidden rounded border border-slate-200" style={{ minHeight: '300px' }}>
                          {runResultData.status === 'error' && runResultData.runtime_error && (
                            <div className="bg-rose-50 border-b border-rose-200 p-3 text-rose-600 font-mono text-[11px] whitespace-pre-wrap shrink-0">
                              <i className="fas fa-exclamation-triangle mr-2"></i>
                              {runResultData.runtime_error}
                            </div>
                          )}
                          <div className="flex w-full flex-grow overflow-hidden">
                            <div className="w-1/3 border-r border-slate-200 flex flex-col h-full bg-slate-50 overflow-y-auto scrollbar-none">
                              {(() => {
                                const visibleLen = runResultData.visible_results?.length || 0;
                                const hiddenLen = runResultData.hidden_summary?.total || 0;
                                const allCount = visibleLen + hiddenLen;

                                return Array.from({ length: allCount }).map((_, i) => {
                                  const isHidden = i >= visibleLen;
                                  const tc = isHidden ? null : runResultData.visible_results[i];
                                  const passed = isHidden
                                    ? (i - visibleLen < runResultData.hidden_summary.passed)
                                    : tc?.passed;

                                  if (i >= evaluatedCount) {
                                    return (
                                      <div key={i} className="px-4 py-3 flex items-center gap-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 bg-slate-50">
                                        <i className="fas fa-spinner fa-spin text-slate-400 w-4 text-center" /> Test case {i} {isHidden && <i className="fas fa-lock ml-1 text-slate-400" />}
                                      </div>
                                    );
                                  }

                                  return (
                                    <button
                                      key={i}
                                      onClick={() => setSelectedTestCase(i)}
                                      className={`w-full px-4 py-3 flex items-center gap-2 border-b border-slate-200 text-[11px] font-bold text-left transition-colors ${selectedTestCase === i ? 'bg-indigo-50 text-indigo-600' : 'bg-white hover:bg-slate-50 text-slate-600'}`}
                                    >
                                      <i className={`fas ${passed ? 'fa-check text-emerald-500' : 'fa-times text-rose-500'} text-[13px] w-4 text-center`} />
                                      Test case {i} {isHidden && <i className="fas fa-lock ml-1 text-slate-400" />}
                                    </button>
                                  );
                                });
                              })()}
                            </div>
                            <div className="w-2/3 h-full overflow-y-auto p-4 scrollbar-none bg-white">
                              {(() => {
                                if (selectedTestCase >= evaluatedCount) {
                                  return <div className="text-slate-500 text-sm italic flex items-center gap-2"><i className="fas fa-spinner fa-spin" /> Evaluating...</div>;
                                }

                                const visibleLen = runResultData.visible_results?.length || 0;
                                const isHidden = selectedTestCase >= visibleLen;

                                if (isHidden) {
                                  const passed = (selectedTestCase - visibleLen) < runResultData.hidden_summary?.passed;
                                  return (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                                      <i className="fas fa-lock text-4xl opacity-30" />
                                      <h3 className="text-lg font-bold text-slate-700">Hidden Test Case</h3>
                                      <p className="text-xs max-w-sm text-center opacity-80 leading-relaxed">Use print or log statements to debug why your hidden test cases are failing.</p>
                                      <div className={`mt-2 px-3 py-1.5 rounded text-xs font-bold border ${passed ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                                        Status: {passed ? 'Passed' : 'Failed'}
                                      </div>
                                    </div>
                                  );
                                }

                                const tc = runResultData.visible_results?.[selectedTestCase];
                                if (!tc) return null;

                                return (
                                  <div className="space-y-4 text-xs">
                                    <div className="font-bold text-lg mb-2 flex items-center gap-2">
                                      {tc.passed ? <span className="text-emerald-600">Accepted</span> : <span className="text-rose-600">Wrong Answer</span>}
                                    </div>
                                    <div>
                                      <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Input</div>
                                      <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-700 break-all">{JSON.stringify(tc.input)}</div>
                                    </div>
                                    <div>
                                      <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Expected Output</div>
                                      <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-700 break-all">{JSON.stringify(tc.expected)}</div>
                                    </div>
                                    <div>
                                      <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Your Output</div>
                                      <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-700 break-all">{JSON.stringify(tc.output)}</div>
                                    </div>
                                    {runResultData.output && (
                                      <div>
                                        <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Stdout</div>
                                        <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-600 whitespace-pre-wrap">{runResultData.output}</div>
                                      </div>
                                    )}
                                    {runResultData.runtime_error && (
                                      <div>
                                        <div className="text-rose-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Runtime Error</div>
                                        <div className="bg-rose-50 border border-rose-100 rounded p-2.5 font-mono text-rose-600 whitespace-pre-wrap">{runResultData.runtime_error}</div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#334155', whiteSpace: 'pre-wrap' }}>
                            {codeOutput || "Run the code to see compiler errors, runtime errors, or pass/fail updates."}
                          </pre>
                          <div style={{ marginTop: '12px', fontSize: '11px', color: '#6366f1', fontStyle: 'italic', fontWeight: 500 }}>
                            💡 Test results are evaluated by AI in this environment.
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#334155', whiteSpace: 'pre-wrap' }}>
                        {consoleOutput || "Console output will display here after execution."}
                      </pre>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id') || searchParams.get('session')

  const session = useInterviewSession(sessionId, interviewType, startRoundTwo)

  const {
    loading,
    showAllSet,
    error,
    isDisclaimerAccepted,
    agreeChecked,
    setAgreeChecked,
    acceptDisclaimer,
    sessionDetail,
    questions,
    currentQuestionIndex,
    currentQuestion,
    proctoringAlert,
    noiseAlertCount,
    showNoiseBanner,
    fullscreenWarning,
    screenShareWarning,
    screenShareViolations,
    uploadPercentage,
    uploadingText,
    skipCountdown,
    showSkipButton,
    transcriptionText,
    globalCountdown,
    isRoundTwo,
    showRound2Confirm,
    setShowRound2Confirm,
    aiInsights,
    videoPreviewRef,
    visualizerCanvasRef,
    enableFullscreen,
    restartScreenShare,
    speakAIQuestion,
    showVoiceCloneSetup,
    completeVoiceCloneSetup,
    handleStartRound2Click,
    proceedToRoundTwo,
    handleNextQuestion,
    handleSubmitInterview,
    handleSkipUpload,
    isMobileDevice,
    recognitionRef,
    isSpeechRecordingRef
  } = session

  // ── Voice Cloning Setup State (UI only) ──────────────────────────────────
  const [vcStep, setVcStep] = useState('idle') // 'idle' | 'recording' | 'uploading' | 'done' | 'error'
  const [vcError, setVcError] = useState('')
  const [localVoiceId, setLocalVoiceId] = useState(null)
  const vcMediaRecorderRef = useRef(null)
  const vcChunksRef = useRef([])

  const startVcRecording = async () => {
    setVcStep('recording')
    setVcError('')
    vcChunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      vcMediaRecorderRef.current = mr
      mr.ondataavailable = (e) => { if (e.data.size > 0) vcChunksRef.current.push(e.data) }
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setVcStep('uploading')
        try {
          const blob = new Blob(vcChunksRef.current, { type: 'audio/webm' })
          const fd = new FormData()
          fd.append('audio', blob, 'voice_sample.webm')
          fd.append('voice_name', `Candidate_${sessionId}`)
          const resp = await fetch(`${API_BASE_URL}/voice-clone-instant`, { method: 'POST', body: fd })
          const data = await resp.json()
          if (!resp.ok) throw new Error(data.detail || 'Cloning failed')
          setLocalVoiceId(data.voice_id)
          setVcStep('done')
        } catch (err) {
          setVcError(err.message || 'Voice cloning failed. Default voice will be used.')
          setVcStep('error')
        }
      }
      mr.start()
      setTimeout(() => { if (mr.state === 'recording') mr.stop() }, 10000)
    } catch (err) {
      setVcError('Microphone access denied: ' + err.message)
      setVcStep('error')
    }
  }

  // ── Case Study Prep Mode ──────────────────────────────────────────────
  const [isPrepMode, setIsPrepMode] = useState(false)
  const [prepTimeLeft, setPrepTimeLeft] = useState(0)

  useEffect(() => {
    if (currentQuestion?.type === 'case_study') {
      setIsPrepMode(true)
      setPrepTimeLeft(30)
      // Stop mic if running
      if (recognitionRef?.current) {
        if (isSpeechRecordingRef) isSpeechRecordingRef.current = false
        try { recognitionRef.current.stop() } catch (e) {}
      }
    } else {
      setIsPrepMode(false)
      // Ensure mic is running for non-prep modes
      if (recognitionRef?.current) {
        if (isSpeechRecordingRef) isSpeechRecordingRef.current = true
        try { recognitionRef.current.start() } catch (e) {}
      }
    }
  }, [currentQuestionIndex, currentQuestion?.type, recognitionRef, isSpeechRecordingRef])

  useEffect(() => {
    let timer
    if (isPrepMode && prepTimeLeft > 0) {
      timer = setInterval(() => {
        setPrepTimeLeft(prev => prev - 1)
      }, 1000)
    } else if (isPrepMode && prepTimeLeft === 0) {
      setIsPrepMode(false)
      // Restart mic when prep time finishes
      if (recognitionRef?.current) {
        if (isSpeechRecordingRef) isSpeechRecordingRef.current = true
        try { recognitionRef.current.start() } catch (e) {}
      }
    }
    return () => clearInterval(timer)
  }, [isPrepMode, prepTimeLeft, recognitionRef, isSpeechRecordingRef])

  const stopVcRecording = () => {
    if (vcMediaRecorderRef.current?.state === 'recording') vcMediaRecorderRef.current.stop()
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen flex-col gap-4 text-slate-600">
        <RefreshCw className="animate-spin text-primary" size={32} />
        <span>Loading secure candidate interview environment...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen flex-col p-6 text-center">
        <AlertTriangle className="text-danger mb-4" size={48} />
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Access Denied</h2>
        <p className="text-slate-600 mt-2 max-w-md text-sm">{error}</p>
        <Link to="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all shadow-[0_4px_14px_rgba(99,102,241,0.15)] mt-6 no-underline">Go to Platform Page</Link>
      </div>
    )
  }

  // Render Disclaimer Page first
  if (!isDisclaimerAccepted) {
    return (
      <div className="max-w-2xl mx-auto my-16 px-6">
        <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Secure Interview Environment</h2>
            <p className="text-slate-500 text-sm mt-1">Acme Proctoring Portal — {sessionDetail?.interview_title}</p>
          </div>

          <div className="flex flex-col gap-3.5 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-sm">
            <strong className="text-warning block">⚠️ Security Guidelines & Integrity Checks:</strong>
            <ul className="pl-5 flex flex-col gap-2 text-slate-600 list-disc">
              <li>Entire screen share and webcam streams will be recorded continuously.</li>
              <li>Leaving full-screen or switching tabs will flag alerts in the system.</li>
              <li>AI face detection checks eye contact and flags cell phone usage.</li>
              <li>Please complete the assessment individually in a quiet room.</li>
            </ul>
          </div>

          <div className="flex gap-2.5 items-center">
            <input
              type="checkbox"
              id="agree"
              checked={agreeChecked}
              onChange={(e) => setAgreeChecked(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="agree" className="cursor-pointer font-semibold text-sm text-slate-900 select-none">I agree to follow the proctoring guidelines above.</label>
          </div>

          <button
            onClick={acceptDisclaimer}
            disabled={!agreeChecked}
            className="w-full py-3.5 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer border-none shadow-[0_4px_14px_rgba(99,102,241,0.15)]"
          >
            I Understand & Start Interview
          </button>
        </div>

        {/* Device Check Modal */}
        {session.showDeviceCheck && (
          <DeviceCheckModal 
            onSuccess={() => {
              session.setShowDeviceCheck(false);
              session.promptScreenShare();
            }} 
            onCancel={() => session.setShowDeviceCheck(false)} 
          />
        )}
      </div>
    )
  }

  // ── Voice Clone Setup Screen ──────────────────────────────────────────────
  if (showVoiceCloneSetup) return (
    <div style={{ minHeight: '100vh', background: '#0a0f1e', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', padding: '24px', fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes vcWave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
        .vc-bar{animation:vcWave 0.9s ease-in-out infinite;transform-origin:bottom;background:linear-gradient(to top,#7c3aed,#a78bfa);width:5px;border-radius:99px;height:32px;}
      `}</style>
      <div style={{ maxWidth: '520px', width: '100%', textAlign: 'center' }}>
        <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg,#7c3aed,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 40px rgba(139,92,246,0.4)' }}>
          <i className="fas fa-waveform-lines" style={{ fontSize: '28px' }} />
        </div>
        <h1 style={{ fontSize: '28px', fontWeight: '900', marginBottom: '8px' }}>Voice Cloning Setup</h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px', fontSize: '15px' }}>Read the sentence below aloud so we can clone your voice for the AI interviewer.</p>

        <div style={{ background: '#0d1117', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '16px', padding: '24px', marginBottom: '28px' }}>
          <p style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '2px', color: '#a78bfa', marginBottom: '12px' }}>Read this clearly:</p>
          <p style={{ color: 'white', fontSize: '18px', fontWeight: '600', lineHeight: '1.6', fontStyle: 'italic' }}>"The quick brown fox jumps over the lazy dog. Please read this sentence clearly."</p>
        </div>

        {vcStep === 'recording' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '40px' }}>
              {Array.from({length: 9}).map((_,i) => <div key={i} className="vc-bar" style={{animationDelay:`${i*0.1}s`}} />)}
            </div>
            <p style={{ color: '#c4b5fd', fontSize: '14px', fontWeight: '600' }}>🔴 Recording... speak now</p>
            <button onClick={stopVcRecording} style={{ padding: '10px 24px', background: '#dc2626', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
              ⏹ Stop Recording
            </button>
          </div>
        )}

        {vcStep === 'uploading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', border: '4px solid rgba(139,92,246,0.3)', borderTop: '4px solid #7c3aed', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ color: '#a78bfa', fontSize: '14px' }}>Cloning your voice with ElevenLabs AI...</p>
          </div>
        )}

        {vcStep === 'done' && (
          <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '16px', padding: '20px', marginBottom: '20px', color: '#34d399' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
            <p style={{ fontWeight: '700', marginBottom: '4px' }}>Voice Cloned Successfully!</p>
            <p style={{ fontSize: '13px', color: '#6ee7b7' }}>The AI will now speak in your voice during the interview.</p>
          </div>
        )}

        {vcStep === 'error' && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '16px', padding: '20px', marginBottom: '20px', color: '#f87171' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
            <p style={{ fontSize: '13px' }}>{vcError || 'An error occurred. The interview will use the default AI voice.'}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {vcStep === 'idle' && (
            <button onClick={startVcRecording} style={{ padding: '16px', background: 'linear-gradient(90deg,#7c3aed,#6366f1)', color: 'white', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '16px', boxShadow: '0 4px 30px rgba(139,92,246,0.4)' }}>
              🎙️ Start Recording (max 10s)
            </button>
          )}
          {(vcStep === 'done' || vcStep === 'error') && (
            <button onClick={() => completeVoiceCloneSetup(localVoiceId)} style={{ padding: '16px', background: 'linear-gradient(90deg,#10b981,#059669)', color: 'white', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '16px', boxShadow: '0 4px 30px rgba(16,185,129,0.4)' }}>
              Continue to Interview →
            </button>
          )}
          {vcStep === 'idle' && (
            <button onClick={() => completeVoiceCloneSetup(null)} style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', color: '#94a3b8', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: '14px' }}>
              Skip — use default AI voice
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // Render Video uploading progress & "All Set!" screen
  if (showAllSet || uploadingText) {
    return (
      <div className="container">
        <div style={{ marginTop: '3rem', background: '#fff', padding: '5rem 2rem', borderRadius: '20px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', textAlign: 'center', border: '1px solid #eff6ff' }}>
          <div>
            <h1 style={{ color: '#6366f1', fontSize: '3rem', marginBottom: '0.5rem', fontWeight: '800' }}>🎉 Thank You!</h1>
            <p style={{ fontSize: '1.25rem', color: '#4b5563', marginBottom: '3rem', fontWeight: '500' }}>Your interview has been successfully submitted.</p>
          </div>

          {!showAllSet ? (
            <div style={{ background: '#f8fafc', padding: '2.5rem', borderRadius: '16px', border: '1px dashed #cbd5e1', maxWidth: '500px', margin: '0 auto' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1.5rem', animation: 'spin 2s linear infinite' }}>⏳</div>
              <h3 style={{ color: '#1e293b', marginBottom: '0.75rem', fontSize: '1.5rem', fontWeight: 'bold' }}>Saving Your Recording</h3>
              <p style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1.5rem' }}>
                We are uploading your video interview. Time depends on your connection speed and interview length.
              </p>
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px', borderRadius: '8px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                ⚠️ PLEASE DO NOT CLOSE THIS TAB
              </div>
              <div style={{ marginTop: '1.5rem', width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${uploadPercentage}%`, height: '100%', background: '#6366f1', transition: 'width 0.3s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.85rem', color: '#6366f1', fontWeight: '700' }}>{uploadingText || 'Preparing video file...'}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>Est: 1-2 mins</div>
              </div>

              {showSkipButton && (
                <div style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#64748b', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                  Taking too long? <a href="#" onClick={(e) => { e.preventDefault(); if (skipCountdown <= 0) handleSkipUpload(); }} style={{ color: skipCountdown <= 0 ? '#6366f1' : '#94a3b8', textDecoration: skipCountdown <= 0 ? 'underline' : 'none', fontWeight: '600', cursor: skipCountdown <= 0 ? 'pointer' : 'not-allowed' }}>Finish & Exit anyway</a>
                  {skipCountdown > 0 && <span style={{ color: '#94a3b8' }}> (available in <span>{skipCountdown}</span>s)</span>}
                  <div style={{ fontSize: '0.75rem', marginTop: '4px', color: '#94a3b8' }}>(Your interview responses are already safely submitted)</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ background: '#f0fdf4', padding: '3rem 2rem', borderRadius: '16px', border: '1px dashed #bbf7d0', maxWidth: '500px', margin: '0 auto' }}>
              <div style={{ background: '#22c55e', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem auto' }}>
                <svg style={{ width: '30px', height: '30px', color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
              </div>
              <h2 style={{ color: '#166534', marginBottom: '1rem', fontSize: '2rem', fontWeight: 'bold' }}>All Set!</h2>
              <p style={{ fontSize: '1.1rem', color: '#15803d', marginBottom: '2rem', lineHeight: '1.6' }}>Your recording has been safe-stored. You may now safely close this window or exit the browser.</p>
              <button onClick={() => {
                if (document.fullscreenElement) {
                  document.exitFullscreen().catch(err => console.log(err))
                }
                window.location.href = '/'
              }} style={{ background: '#1e293b', color: 'white', padding: '12px 32px', borderRadius: '9999px', fontSize: '1.1rem', fontWeight: '600', border: 'none', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                Exit Now
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const currentQuestionText = currentQuestion?.text || currentQuestion?.question || currentQuestion?.prompt || ''

  const displayQuestionNum = currentQuestion?.caseStudyIndex !== undefined 
    ? currentQuestion.caseStudyIndex + 1 
    : currentQuestionIndex + 1

  const totalDisplayQuestions = currentQuestion?.type === 'case_study'
    ? questions.filter(q => q.type === 'case_study').length
    : questions.filter(q => q.type !== 'case_study').length

  return (
    <div className={currentQuestion?.type === 'coding' ? "w-screen h-screen p-0 m-0 max-w-none overflow-hidden flex flex-col" : "container"}>
      {/* Alerts */}
      {showNoiseBanner && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '380px' }}>
          <Volume2 size={20} style={{ animation: 'bounce 1s infinite' }} />
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>Background Noise Alert</strong>
            <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>Please maintain silence. Alerts: {noiseAlertCount}/10</p>
          </div>
        </div>
      )}

      {fullscreenWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '30px', fontWeight: '800', color: '#fff' }}>⚠️ Anti-Cheating Alert</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.5' }}>Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={enableFullscreen} style={{ padding: '12px 32px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Enable Full Screen</button>
            <button onClick={() => handleSubmitInterview(true)} style={{ padding: '12px 32px', borderRadius: '9999px', background: 'transparent', color: '#ef4444', fontWeight: 'bold', border: '2px solid #ef4444', cursor: 'pointer' }}>Exit Interview</button>
          </div>
        </div>
      )}

      {screenShareWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>Screen Sharing Stopped</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '400px' }}>You must share your entire screen to continue the proctored interview. Violations: {screenShareViolations} of 3</p>
          <button onClick={restartScreenShare} style={{ padding: '10px 24px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}>Restart Screen Share</button>
        </div>
      )}

      {currentQuestion?.type === 'coding' ? (
        renderRoundTwoUI ? renderRoundTwoUI({ ...session, sessionId }) : null
      ) : (
        <div id="interviewSection" className="grid grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] gap-6 flex-1 min-h-0 overflow-hidden p-2">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>

          <div className="ip-left flex flex-col gap-4 h-full overflow-y-auto pr-1 scrollbar-none">
            {/* AI Analyzing Status Card */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all duration-300 hover:shadow-md hover:scale-[1.01] hover:border-indigo-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="m-0 text-sm font-bold text-slate-800">AI Analyzing</h4>
                <p className="m-0 text-[11px] text-slate-500 font-medium">AI is Reading the Question...</p>
              </div>
              <div className="flex items-end gap-0.5 h-6 shrink-0">
                <span className="w-1 bg-emerald-500 rounded-full h-2 animate-[audioBar_0.8s_ease-in-out_infinite_alternate]"></span>
                <span className="w-1 bg-emerald-500 rounded-full h-4 animate-[audioBar_0.8s_ease-in-out_infinite_alternate_0.15s]"></span>
                <span className="w-1 bg-emerald-500 rounded-full h-3 animate-[audioBar_0.8s_ease-in-out_infinite_alternate_0.3s]"></span>
                <span className="w-1 bg-emerald-500 rounded-full h-5 animate-[audioBar_0.8s_ease-in-out_infinite_alternate_0.1s]"></span>
              </div>
            </div>

            {/* Timer Card */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col items-center gap-4 transition-all duration-300 hover:shadow-md">
              <div className="relative w-28 h-28">
                <svg className="-rotate-90 w-28 h-28" viewBox="0 0 110 110">
                  <circle className="fill-none stroke-slate-100 stroke-[8px]" cx="55" cy="55" r="47" />
                  <circle className="fill-none stroke-[8px] stroke-[url(#timerGradient)] [stroke-linecap:round] [stroke-dasharray:295.3] [stroke-dashoffset:0] transition-[stroke-dashoffset] duration-1000 ease-linear" cx="55" cy="55" r="47" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-extrabold text-slate-800 font-mono leading-none">
                    {Math.floor(globalCountdown / 60).toString().padStart(2, '0')}:{(globalCountdown % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Remaining</span>
                </div>
              </div>

              {!isRoundTwo && sessionDetail?.interview_type !== 'Normal' && (
                <button
                  onClick={handleStartRound2Click}
                  className="w-full py-2.5 px-4 rounded-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer border-none shadow-[0_4px_12px_rgba(99,102,241,0.2)] flex items-center justify-center gap-2"
                >
                  🚀 Start Round 2 &rarr;
                </button>
              )}

              <button 
                className="w-full py-2.5 px-4 rounded-full font-bold text-xs bg-slate-800 hover:bg-slate-900 text-white transition-all cursor-pointer border-none shadow-sm flex items-center justify-center gap-2" 
                onClick={() => handleSubmitInterview(false)}
              >
                ⏹ End Interview
              </button>
            </div>

            {/* AI insights Card */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-md">
              <h4 className="m-0 mb-4 text-[13px] font-bold text-slate-800 tracking-wide uppercase">AI Live Evaluation</h4>
              
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">CLARITY & COMMUNICATION</span>
                  <span className="text-xs font-bold text-emerald-500">{aiInsights.clarity}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000" style={{ width: `${aiInsights.clarity}%` }}></div>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">
                    {sessionDetail?.interview_type === 'Non-Technical' || sessionDetail?.interview_type === 'Normal'
                      ? 'STRUCTURED THINKING'
                      : 'TECHNICAL DEPTH'}
                  </span>
                  <span className="text-xs font-bold text-indigo-500">{aiInsights.technicalDepth}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${aiInsights.technicalDepth}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">
                    {sessionDetail?.interview_type === 'Non-Technical' || sessionDetail?.interview_type === 'Normal'
                      ? 'CASE RESOLUTION'
                      : 'CONFIDENCE'}
                  </span>
                  <span className="text-xs font-bold text-amber-500">{aiInsights.confidence}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-1000" style={{ width: `${aiInsights.confidence}%` }}></div>
                </div>
              </div>
            </div>

            {/* Audio canvas visualizer */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-md flex flex-col gap-2">
              <h4 className="m-0 text-[13px] font-bold text-slate-800 tracking-wide uppercase">Voice Monitor</h4>
              <div className="relative w-full h-12 bg-slate-50 border border-slate-200/80 rounded-xl overflow-hidden shadow-inner flex items-center justify-center">
                <canvas ref={visualizerCanvasRef} className="w-full h-full block" />
              </div>
            </div>
          </div>

          <div className="ip-right flex flex-col gap-4 h-full min-h-0">
            {isPrepMode ? (
              <div className="bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[2rem] p-8 shadow-sm flex flex-col gap-6 h-full min-h-0 overflow-y-auto">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 text-lg shadow-sm">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477-4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    </div>
                    <h2 className="text-xl font-extrabold text-slate-800 tracking-tight m-0">Case Study Round</h2>
                    <span className="rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-bold px-3 py-1 ml-2 uppercase tracking-wide border border-indigo-100">
                      {currentQuestion?.skill_tested || 'Scenario Based Question'}
                    </span>
                  </div>
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">
                    Question <span className="text-indigo-600 font-black">{displayQuestionNum}</span> of {totalDisplayQuestions}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2 m-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> 
                    Scenario
                  </h3>
                  <div className="text-slate-700 leading-relaxed text-[15px] font-medium bg-slate-50 border-l-4 border-indigo-600 px-5 py-4 rounded-r-xl">
                    {currentQuestion?.scenario || 'No scenario details available.'}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2 m-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
                    Your Tasks
                  </h3>
                  <div className="flex flex-col gap-3 pl-1">
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-sm mt-0.5">1</span>
                      <span className="text-slate-700 text-[15px] font-semibold">{currentQuestion?.rawQuestion || 'Identify key problems, analyze root causes, and suggest actionable solutions.'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#f8f6ff] border border-indigo-100 rounded-2xl p-5 mt-2">
                  <h3 className="text-[13px] font-bold text-indigo-600 flex items-center gap-2 mb-3 m-0 uppercase tracking-wide">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Instructions
                  </h3>
                  <ul className="list-disc pl-5 m-0 text-slate-700 text-[14px] leading-relaxed space-y-1.5 font-medium">
                    <li>Take a few minutes to think.</li>
                    <li>Structure your approach before presenting your solution.</li>
                    <li>You can take notes on the right panel.</li>
                    <li>Present your case like you would in a real interview.</li>
                  </ul>
                </div>

                <div className="flex items-center justify-center mt-auto pt-4">
                  <button
                    onClick={() => {
                      setIsPrepMode(false)
                      if (recognitionRef?.current) {
                        if (isSpeechRecordingRef) isSpeechRecordingRef.current = true
                        try { recognitionRef.current.start() } catch (e) {}
                      }
                    }}
                    className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-700 border-none cursor-pointer transition-all shadow-md flex items-center gap-2"
                  >
                    Start Answering (in {prepTimeLeft}s) <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Question Card */}
                <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md before:content-[''] before:absolute before:top-0 before:left-0 before:w-1.5 before:h-full before:bg-gradient-to-b before:from-indigo-500 before:to-emerald-500">
                  <div className="text-[11px] text-slate-400 font-extrabold tracking-wider uppercase mb-2">
                    Question <span id="questionNumber" className="text-indigo-600 font-black">{displayQuestionNum}</span> of <span id="totalQuestions">{totalDisplayQuestions}</span>
                  </div>
                  <div className="flex gap-2 justify-end mb-4">
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">
                      {currentQuestion?.category || currentQuestion?.type || 'Case Analysis'}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border ${
                      String(currentQuestion?.difficulty || 'Easy').toLowerCase() === 'easy'
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                        : String(currentQuestion?.difficulty || 'Easy').toLowerCase() === 'medium'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-red-50 text-red-600 border-red-100'
                    }`}>
                      {currentQuestion?.difficulty || 'Easy'}
                    </span>
                  </div>
                  <div className="flex gap-4 items-start">
                    <div className="w-1.5 bg-indigo-600 self-stretch rounded-full shrink-0 min-h-[60px]" />
                    <p className="flex-1 text-slate-800 text-base md:text-lg font-semibold leading-relaxed m-0">{currentQuestionText || 'Question is loading...'}</p>
                    <button 
                      className="bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-100 cursor-pointer p-2.5 rounded-full transition-all duration-200 shrink-0" 
                      onClick={() => speakAIQuestion(currentQuestionText)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Transcript Card */}
                <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col h-[260px] shrink-0 transition-all duration-300 hover:shadow-md">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800 tracking-wide uppercase">
                      <span>🎙</span> Live Transcript
                    </div>
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-500 text-[10px] font-bold tracking-wider px-3 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                      RECORDING
                    </div>
                  </div>
                  <textarea
                    className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 text-base leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-inner resize-none w-full flex-1 overflow-y-auto transition-all"
                    placeholder="Your speech will appear here automatically..."
                    readOnly
                    value={transcriptionText}
                  />
                </div>

                {/* Navigation buttons */}
                <div className="flex gap-3 justify-center items-center mt-2 shrink-0">
                  {currentQuestionIndex === questions.length - 1 ? (
                    !isRoundTwo && sessionDetail?.interview_type !== 'Normal' ? (
                      <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2.5 rounded-xl">
                        <span className="text-xs font-semibold text-indigo-600">
                          Round 1 complete. Click "Start Round 2" in the sidebar to proceed.
                        </span>
                      </div>
                    ) : (
                      <button 
                        className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all duration-200 cursor-pointer border-none"
                        onClick={() => handleSubmitInterview(false)}
                      >
                        Submit Interview
                      </button>
                    )
                  ) : (
                    <button 
                      className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-200 cursor-pointer border-none"
                      onClick={handleNextQuestion}
                    >
                      Next &rarr;
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Camera Preview Widget */}
      {isDisclaimerAccepted && !showAllSet && !loading && (
        <div className="fixed bottom-6 right-6 w-56 h-36 rounded-xl overflow-hidden shadow-2xl border-2 border-indigo-600 z-[9999] bg-black transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_15px_30px_rgba(99,102,241,0.25)] hover:border-violet-500">
          <video ref={videoPreviewRef} autoPlay muted playsInline id="videoPreview" className="w-full h-full object-cover" />
          <div className="absolute bottom-3 left-3 bg-red-500 text-white text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
          </div>
          {proctoringAlert && (
            <div className="absolute inset-0 bg-black/85 text-red-500 flex flex-col items-center justify-center p-3 text-center z-10">
              <span className="text-xl mb-1 animate-bounce">⚠️</span>
              <div className="text-[10px] font-bold leading-tight">{proctoringAlert}</div>
            </div>
          )}
        </div>
      )}

      {showRound2Confirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 transform transition-all text-left">
            <div className="flex items-center gap-3 text-amber-500 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-950 m-0">Switch to Round 2?</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              Round 1 is not complete. Are you sure you want to move to Round 2?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRound2Confirm(false)}
                className="px-4 py-2 rounded-lg font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={proceedToRoundTwo}
                className="px-4 py-2 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors border-none cursor-pointer"
              >
                Yes, Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
