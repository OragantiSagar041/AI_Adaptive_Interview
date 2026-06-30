import React from 'react'
import { InterviewBase } from './InterviewBase'
import api from '../../utils/api'
import { API_BASE_URL } from '../../apiConfig'

export const InterviewTechnical = () => {

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
      handleSubmitInterview
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
              <button className="ip-btn-prev" style={{ padding: '8px 20px', marginLeft: 'auto' }}>Start Voice Notes</button>
              <button className="ip-btn-next" style={{ padding: '8px 20px' }} onClick={handleRunCode}>Run & Evaluate</button>
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

  return (
    <InterviewBase
      interviewType="Technical"
      startRoundTwo={startRoundTwo}
      renderRoundTwoUI={renderRoundTwoUI}
    />
  )
}
export default InterviewTechnical
