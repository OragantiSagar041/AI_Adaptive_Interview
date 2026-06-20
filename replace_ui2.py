import re

with open(r'C:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end\src\pages\HomePage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_return = """  return (
    <div className="container">
      {/* Alerts */}
      {showNoiseBanner && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '380px' }}>
          <Volume2 size={20} style={{ animation: 'bounce 1s infinite' }} />
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>Background Noise Alert</strong>
            <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>Please maintain silence. Alerts: {noiseAlertCount}/20</p>
          </div>
        </div>
      )}

      {fullscreenWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '30px', fontWeight: '800', color: '#fff' }}>⚠️ Anti-Cheating Alert</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.5' }}>Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
          <button onClick={enableFullscreen} style={{ padding: '12px 32px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Enable Full Screen</button>
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
        <div id="codingRoundSection" className="coding-round-shell" style={{ marginTop: '1.5rem', width: '100%' }}>
          <div className="coding-round-header">
            <div>
              <p className="coding-round-kicker">Round 2</p>
              <h2>Live Coding Task</h2>
              <p>Round 2 has {Math.floor(globalCountdown / 60).toString().padStart(2, '0')}:{(globalCountdown % 60).toString().padStart(2, '0')} remaining. Explain your logic to the AI while you code.</p>
            </div>
            <div className="coding-round-actions">
              <button className="btn btn-primary" onClick={handleRunCode} disabled={compiling}>Get AI Feedback</button>
              <button className="btn btn-danger" onClick={() => {
                handleSubmitInterview(false);
                setTimeout(() => navigate('/case-study'), 1500);
              }}>Submit Code</button>
            </div>
          </div>

          <div className="coding-round-grid">
            <div className="coding-problem-card" style={{ position: 'relative' }}>
              <div className="coding-problem-topbar">
                <div className="coding-problem-tabs">
                  <span className="coding-tab-pill active" style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#4b5563' }}>Description</span>
                  <span className="coding-tab-pill" style={{ color: '#94a3b8' }}>Editorial Disabled</span>
                </div>
                <div className="coding-problem-meta" style={{ display: 'flex', gap: '8px' }}>
                  <span className="question-difficulty" style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>Easy</span>
                  <span className="question-type" style={{ background: '#e0e7ff', color: '#3730a3', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{selectedLanguage}</span>
                </div>
              </div>
              <div className="coding-problem-scroll" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: '#1e293b', marginBottom: '16px' }}>{currentQuestion.title || 'Technical Assessment'}</h3>
                <p style={{ color: '#475569', lineHeight: '1.6', marginBottom: '24px' }}>{currentQuestionText}</p>
                {/* Floating Video for Coding Round */}
                <div style={{ position: 'absolute', bottom: '24px', left: '24px', width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', border: '3px solid #6366f1', boxShadow: '0 10px 25px rgba(0,0,0,0.2)', zIndex: 50 }}>
                   <video ref={videoPreviewRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
            </div>

            <div className="coding-editor-card">
              <div className="coding-editor-topbar" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '0 16px' }}>
                <div className="coding-right-tabs" style={{ display: 'flex', gap: '24px' }}>
                  <button className="coding-right-tab active" style={{ borderBottom: '2px solid #4f46e5', color: '#1e293b', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}>Code</button>
                  <button className="coding-right-tab" style={{ color: '#64748b', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none' }}>Testcase</button>
                  <button className="coding-right-tab" style={{ color: '#64748b', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none' }}>Result</button>
                </div>
                <div className="coding-round-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                   <button className="btn btn-primary" style={{ background: '#4f46e5', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', border: 'none' }}>Get AI Feedback</button>
                   <button className="btn btn-danger" style={{ background: '#ef4444', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: '600', border: 'none' }}>Submit</button>
                </div>
              </div>

              <div className="coding-toolbar" style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '14px', color: '#64748b', fontWeight: '500' }}>Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', outline: 'none', background: '#fff' }}
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                </select>
                <button style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: '600' }}>Start Voice Notes</button>
                <button style={{ background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: '600' }} onClick={handleRunCode}>Run Code</button>
              </div>

              <div className="coding-editor-wrap" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="coding-editor-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>Editor</h4>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Write your solution in the IDE below.</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Autosave by language</div>
                </div>
                
                <textarea
                  className="coding-codebox"
                  spellCheck="false"
                  placeholder="// Write your solution here..."
                  value={codeAnswer}
                  onChange={(e) => setCodeAnswer(e.target.value)}
                  style={{ flexGrow: 1, width: '100%', border: 'none', outline: 'none', padding: '16px', fontFamily: 'monospace', fontSize: '14px', resize: 'none', background: '#fff' }}
                ></textarea>

                <div className="coding-console-shell" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <div className="coding-console-tabs" style={{ display: 'flex', gap: '2px', background: '#e2e8f0', padding: '8px 8px 0 8px' }}>
                    <button className="coding-console-tab active" style={{ background: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px 8px 0 0', fontWeight: '600', color: '#1e293b' }}>Test Results</button>
                    <button className="coding-console-tab" style={{ background: 'transparent', border: 'none', padding: '8px 16px', color: '#64748b' }}>Console</button>
                  </div>
                  <div className="coding-console-pane active" style={{ padding: '16px', background: '#fff', minHeight: '120px' }}>
                    <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#334155', whiteSpace: 'pre-wrap' }}>
                      {codeOutput || "Run the code to see compiler errors, runtime errors, or pass/fail updates."}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div id="interviewSection">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>

          <div className="ip-left">
            <div className="ip-avatar-card">
              <video ref={videoPreviewRef} autoPlay muted playsInline id="videoPreview" />
              <div className="live-badge">LIVE</div>
              {proctoringAlert && (
                 <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, fontSize: '1.2rem', fontWeight: 'bold', flexDirection: 'column', textAlign: 'center', padding: '20px' }}>
                   <span style={{ fontSize: '3rem', marginBottom: '10px' }}>⚠️</span>
                   <div>{proctoringAlert}</div>
                 </div>
              )}
            </div>

            <div className="ip-analyzing-card">
              <div className="ip-analyzing-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
                </svg>
              </div>
              <div className="ip-analyzing-text">
                <h4>AI Analyzing</h4>
                <p>AI is Reading the Question...</p>
              </div>
              <div className="ip-audio-bars">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>

            <div className="ip-timer-card">
              <div className="ip-timer-ring">
                <svg width="110" height="110" viewBox="0 0 110 110">
                  <circle className="track" cx="55" cy="55" r="47" />
                  <circle className="fill" cx="55" cy="55" r="47" />
                </svg>
                <div className="ip-timer-label">
                  <span>{Math.floor(globalCountdown / 60).toString().padStart(2, '0')}:{(globalCountdown % 60).toString().padStart(2, '0')}</span>
                  <span className="remaining-lbl">Remaining</span>
                </div>
              </div>
              <button className="ip-end-btn" onClick={() => handleSubmitInterview(false)}>
                ⏹ End Interview
              </button>
            </div>

            <div className="ip-insights-card">
              <h4>AI Insights</h4>
              <div className="insight-row">
                <div className="insight-row-header">
                  <span className="insight-label">CLARITY</span>
                  <span className="insight-value" style={{ color: '#10b981' }}>60%</span>
                </div>
                <div className="insight-bar-track">
                  <div className="insight-bar-fill clarity" style={{ width: '60%' }}></div>
                </div>
              </div>
              <div className="insight-row">
                <div className="insight-row-header">
                  <span className="insight-label">TECHNICAL DEPTH</span>
                  <span className="insight-value" style={{ color: '#6366f1' }}>30%</span>
                </div>
                <div className="insight-bar-track">
                  <div className="insight-bar-fill techDepth" style={{ width: '30%' }}></div>
                </div>
              </div>
              <div className="insight-row">
                <div className="insight-row-header">
                  <span className="insight-label">CONFIDENCE</span>
                  <span className="insight-value" style={{ color: '#f59e0b' }}>80%</span>
                </div>
                <div className="insight-bar-track">
                  <div className="insight-bar-fill confidence" style={{ width: '80%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="ip-right">
            <div className="ip-question-card">
              <div style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.5rem' }}>
                Question <span id="questionNumber">{currentQuestionIndex + 1}</span> of <span id="totalQuestions">{questions.length}</span>
              </div>
              <div className="ip-question-meta">
                <span className="ip-tag type">{currentQuestion?.type || 'Self-Introduction'}</span>
                <span className="ip-tag difficulty">Easy</span>
              </div>
              <div className="ip-question-body">
                <div className="q-bar"></div>
                <p>{currentQuestionText || 'Question is loading...'}</p>
                <button className="ip-mute-btn" onClick={() => speakAIQuestion(currentQuestionText)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                </button>
              </div>
            </div>

            <div className="ip-transcript-card">
              <div className="ip-transcript-header">
                <div className="ip-transcript-title">🎙 Live Transcript</div>
                <div className="ip-recording-badge">
                  <div className="rec-dot"></div>
                  RECORDING
                </div>
              </div>
              <textarea 
                className="ip-transcript-box" 
                placeholder="Your speech will appear here automatically..."
                readOnly 
                value={transcriptionText} 
              />
            </div>

            <div className="ip-nav-row">
              <button className="ip-btn-prev" onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0}>← Prev</button>
              {currentQuestionIndex === questions.length - 1 ? (
                <button className="ip-btn-next" style={{ marginLeft: '10px', background: '#2563eb' }} onClick={() => {
                  handleSubmitInterview(false);
                  setTimeout(() => navigate('/case-study'), 1500);
                }}>
                  Next Round →
                </button>
              ) : (
                <button className="ip-btn-next" onClick={handleNextQuestion}>Next →</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
"""

new_content = re.sub(
    r'  return \(\n    <div className=\"container\">.*}\n\nexport default HomePage',
    new_return + '\n\nexport default HomePage',
    content,
    flags=re.DOTALL
)

with open(r'C:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end\src\pages\HomePage.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
