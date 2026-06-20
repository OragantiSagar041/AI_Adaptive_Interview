import re

with open(r'C:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end\src\pages\HomePage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

new_return = """  return (
    <div className="container">
      {/* Background Noise banner */}
      {showNoiseBanner && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '380px' }}>
          <Volume2 size={20} style={{ animation: 'bounce 1s infinite' }} />
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>Background Noise Alert</strong>
            <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>Please maintain silence. Alerts: {noiseAlertCount}/20</p>
          </div>
        </div>
      )}

      {/* Fullscreen Alert Banner */}
      {fullscreenWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '30px', fontWeight: '800', color: '#fff' }}>⚠️ Anti-Cheating Alert</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.5' }}>Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
          <button
            onClick={enableFullscreen}
            style={{ padding: '12px 32px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
          >
            Enable Full Screen
          </button>
        </div>
      )}

      {/* Screen Share alert */}
      {screenShareWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>Screen Sharing Stopped</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '400px' }}>You must share your entire screen to continue the proctored interview. Violations: {screenShareViolations} of 3</p>
          <button
            onClick={restartScreenShare}
            style={{ padding: '10px 24px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
          >
            Restart Screen Share
          </button>
        </div>
      )}

      <div id="interviewSection">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="ip-left">
          {/* AI Avatar */}
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

          {/* AI Analyzing Status */}
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

          {/* Circular Timer */}
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

          {/* AI Insights */}
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

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="ip-right">
          {currentQuestion?.type === 'coding' ? (
            <div className="coding-round-shell" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', marginTop: '0', background: '#0f172a', borderColor: '#1e293b', borderRadius: '14px', padding: '1.5rem' }}>
              <div className="coding-round-header">
                <div>
                  <h5 className="coding-round-kicker" style={{ color: '#818cf8' }}>Technical Assessment</h5>
                  <h2 style={{ color: '#f8fafc', margin: 0 }}>Coding Round</h2>
                </div>
                <div className="coding-round-actions">
                  <select
                    className="coding-tab-pill"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    style={{ background: '#1e293b', color: '#f8fafc', borderColor: '#334155' }}
                  >
                    <option value="python">Python 3</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                  </select>
                </div>
              </div>

              <div className="coding-round-grid" style={{ display: 'flex', flexDirection: 'column', minHeight: '300px', flexGrow: 1 }}>
                <div className="coding-editor-card" style={{ background: '#0f172a', borderColor: '#1e293b', flexGrow: 1 }}>
                  
                  <div className="coding-editor-container" style={{ background: '#020617', border: 'none' }}>
                    <textarea
                      className="w-full h-full bg-transparent text-[#e2e8f0] p-4 font-mono text-sm border-none outline-none resize-none"
                      value={codeAnswer}
                      onChange={(e) => setCodeAnswer(e.target.value)}
                      placeholder="// Write your code solution here..."
                      style={{ minHeight: '200px' }}
                    ></textarea>
                  </div>

                  <div className="coding-console-shell" style={{ background: '#0f172a', borderColor: '#1e293b', minHeight: '120px' }}>
                    <div className="coding-console-tabs" style={{ background: '#1e293b', borderColor: '#334155' }}>
                      <button className="coding-console-tab active" style={{ color: '#f8fafc' }}>Test Output</button>
                    </div>
                    <div className="coding-console-pane active">
                      <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap">
                        {codeOutput || "Run code to see output..."}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Question Card */}
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
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Live Transcript Card */}
              <div className="ip-transcript-card">
                <div className="ip-transcript-header">
                  <div className="ip-transcript-title">
                    🎙 Live Transcript
                  </div>
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
            </>
          )}

          {/* Navigation */}
          <div className="ip-nav-row">
            {currentQuestion?.type === 'coding' && (
              <button className="ip-btn-prev" onClick={handleRunCode} disabled={compiling} style={{ marginRight: 'auto', background: '#3b82f6', color: 'white', border: 'none' }}>
                {compiling ? 'Running...' : 'Run Code'}
              </button>
            )}
            
            <button className="ip-btn-prev" onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0}>← Prev</button>
            
            {currentQuestionIndex === questions.length - 1 ? (
              <button className="ip-btn-next" style={{ background: '#2563eb' }} onClick={() => {
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
    </div>
  )
}"""

# Do the regex replacement
new_content = re.sub(
    r'  return \(\n    <div className=\"container\" style={{ height: \"100vh\", overflow: \"hidden\", background: \"#0f172a\", padding: \"1.5rem\" }}>.*}\n\nexport default HomePage',
    new_return + '\n\nexport default HomePage',
    content,
    flags=re.DOTALL
)

with open(r'C:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end\src\pages\HomePage.jsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
