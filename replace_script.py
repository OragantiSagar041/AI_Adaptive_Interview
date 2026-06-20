import re

with open(r'C:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end\src\pages\HomePage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """  // Render "All Set!" screen
  if (showAllSet) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', textAlign: 'center', background: '#0f172a', color: '#fff' }}>
        <div style={{ background: '#22c55e', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <svg style={{ width: '40px', height: '40px', color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '16px' }}>All Set!</h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px', fontSize: '18px' }}>Your interview has been successfully submitted and saved.</p>
        <button onClick={() => navigate('/')} style={{ padding: '12px 32px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
          Exit Now
        </button>
      </div>
    )
  }

  // Render Video uploading progress panel
  if (uploadingText) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px', padding: '24px', textAlign: 'center', background: '#0f172a' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>{uploadingText}</h2>
        {uploadPercentage > 0 && uploadPercentage < 100 && (
          <div style={{ width: '300px', height: '10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#4f46e5', transition: 'width 0.3s', width: `${uploadPercentage}%` }}></div>
          </div>
        )}
        {showSkipButton && uploadPercentage < 100 && (
          <div style={{ marginTop: '16px', padding: '16px', border: '1px solid #fbbf24', background: '#fffbeb', borderRadius: '12px', maxWidth: '380px' }}>
            <p style={{ color: '#92400e', fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
              Takes too long? Your text answers are already saved.
            </p>
            <button 
              onClick={handleSkipUpload}
              disabled={skipCountdown > 0}
              style={{ padding: '8px 16px', borderRadius: '9999px', fontSize: '14px', fontWeight: 'bold', cursor: skipCountdown > 0 ? 'not-allowed' : 'pointer', background: skipCountdown > 0 ? '#e2e8f0' : '#fef3c7', color: skipCountdown > 0 ? '#94a3b8' : '#b45309', border: skipCountdown > 0 ? 'none' : '1px solid #fcd34d' }}
            >
              {skipCountdown > 0 ? `Skip available in ${skipCountdown}s` : 'Skip Video Upload'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="container" style={{ height: "100vh", overflow: "hidden", background: "#0f172a", padding: "1.5rem" }}>
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
          {/* AI Avatar / Video Preview */}
          <div className="ip-avatar-card">
            <video ref={videoPreviewRef} autoPlay muted playsInline id="videoPreview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div className="ip-live-badge">
              <span className="ip-live-dot"></span> LIVE
            </div>
            {proctoringAlert && (
               <div style={{ position: 'absolute', bottom: '12px', left: '12px', right: '12px', padding: '12px', background: '#ef4444', color: '#fff', borderRadius: '8px', fontSize: '12px', fontWeight: '800', display: 'flex', gap: '8px', alignItems: 'center', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', animation: 'pulse 2s infinite' }}>
                 <ShieldAlert size={14} style={{ flexShrink: 0 }} /> {proctoringAlert}
               </div>
            )}
          </div>

          <div className="ip-analyzing-card">
            <div className="ip-analyzing-header">
              <span className="ip-analyzing-title">Analyzing Response</span>
              <div className="ip-audio-bars">
                <span className="ip-bar"></span>
                <span className="ip-bar"></span>
                <span className="ip-bar"></span>
                <span className="ip-bar"></span>
                <span className="ip-bar"></span>
              </div>
            </div>

            <div className="ip-insights-grid">
              <div className="ip-insight-item">
                <span className="ip-insight-label">Confidence</span>
                <div className="ip-insight-bar"><div className="ip-insight-fill" style={{ width: '85%' }}></div></div>
              </div>
              <div className="ip-insight-item">
                <span className="ip-insight-label">Clarity</span>
                <div className="ip-insight-bar"><div className="ip-insight-fill" style={{ width: '92%' }}></div></div>
              </div>
            </div>

            <div className="ip-timer-card">
              <svg className="ip-timer-ring" viewBox="0 0 100 100">
                <circle className="ip-timer-bg" cx="50" cy="50" r="45"></circle>
                <circle className="ip-timer-progress" cx="50" cy="50" r="45"></circle>
              </svg>
              <div className="ip-timer-text">
                <span className="ip-timer-value">02:00</span>
                <span className="ip-timer-label">REMAINING</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="ip-right">
          <div className="ip-question-card">
            <div className="ip-question-header">
              <div className="ip-question-tags">
                <span className="ip-tag ip-tag-primary">{currentQuestion?.type || 'Verbal'}</span>
                <span className="ip-tag ip-tag-success">Question {currentQuestionIndex + 1} of {questions.length}</span>
              </div>
              <button className="ip-btn-repeat" onClick={() => speakAIQuestion(currentQuestionText)}>
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Repeat
              </button>
            </div>
            <h2 className="ip-question-text">{currentQuestionText || 'Question is loading...'}</h2>
          </div>

          {currentQuestion?.type === 'coding' ? (
            <div className="coding-round-shell" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', marginTop: '1rem', background: '#0f172a', borderColor: '#1e293b' }}>
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
            <div className="ip-transcript-card">
              <div className="ip-transcript-header">
                <div className="ip-transcript-title">
                  <span className={`ip-mic-indicator ${transcriptionText ? 'mic-active' : 'mic-waiting'}`}></span>
                  Live Transcript
                </div>
              </div>
              <div className="ip-transcript-box">
                <div className="ip-transcript-line">
                  {transcriptionText || 'Listening...'}
                </div>
              </div>
              <canvas 
                ref={visualizerCanvasRef} 
                width="800" 
                height="80" 
                style={{ width: '100%', height: '60px', marginTop: '10px', borderRadius: '8px', background: '#f8fafc' }}
              ></canvas>
            </div>
          )}

          <div className="ip-controls-row" style={{ marginTop: 'auto', display: 'flex', gap: '12px', justifyContent: 'flex-end', paddingTop: '20px' }}>
            {currentQuestion?.type === 'coding' && (
              <button className="ip-btn-prev" onClick={handleRunCode} disabled={compiling} style={{ marginRight: 'auto' }}>
                {compiling ? 'Running...' : 'Run Code'}
              </button>
            )}

            <button className="ip-btn-prev" onClick={() => handleSubmitInterview(false)} style={{ color: '#ef4444', borderColor: '#fecaca', background: '#fef2f2' }}>
              End Interview
            </button>
            
            <button className="ip-btn-next" onClick={handleNextQuestion}>
              Next <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path></svg>
            </button>

            {currentQuestionIndex === questions.length - 1 && (
               <button className="ip-btn-next" style={{ background: '#2563eb' }} onClick={() => {
                 handleSubmitInterview(false);
                 setTimeout(() => navigate('/case-study'), 1500); // Route to case study
               }}>
                 Next Round <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
               </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default HomePage
"""

content = re.sub(r'  // Render Video uploading progress panel\n  if \(uploadingText\).*?export default HomePage', replacement, content, flags=re.DOTALL)

with open(r'C:\Users\sagar\Downloads\mock-interview - Copy (3)\Front-end\src\pages\HomePage.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Phase 2 completed')
