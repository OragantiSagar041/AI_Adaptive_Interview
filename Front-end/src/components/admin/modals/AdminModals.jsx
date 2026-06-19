import React from 'react'
import { RefreshCw, Video, X, Monitor, Eye } from 'lucide-react'
import Modal from '../../Modal'
import Button from '../../Button'
import Badge from '../../Badge'

export function CandidateScorecardModal({
  isOpen,
  onClose,
  selectedCandidate,
  loadingDetail,
  candidateDetail,
  handleUpdateDecision
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={selectedCandidate?.candidate_name}
      subtitle={selectedCandidate?.candidate_email}
      maxWidth="max-w-4xl"
      footer={
        <div className="flex gap-3 w-full sm:w-auto">
          <Button
            onClick={() => handleUpdateDecision(selectedCandidate.link_id || selectedCandidate.id, 'selected')}
            variant="primary"
            className="flex-1 sm:flex-initial bg-emerald-500 hover:bg-emerald-600 shadow-[0_4px_10px_rgba(16,185,129,0.2)]"
          >
            Shortlist Candidate
          </Button>
          <Button
            onClick={() => handleUpdateDecision(selectedCandidate.link_id || selectedCandidate.id, 'rejected')}
            variant="danger"
            className="flex-1 sm:flex-initial"
          >
            Reject Candidate
          </Button>
        </div>
      }
    >
      {loadingDetail ? (
        <div className="flex justify-center items-center py-12 gap-2 text-slate-400">
          <RefreshCw size={18} className="animate-spin" />
          <span>Loading evaluation detail logs...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-5 text-slate-300">
          <div className="grid grid-cols-2 gap-4 bg-slate-900/50 p-4 rounded-xl border border-white/5">
            <div>
              <span className="text-[0.68rem] text-slate-400 uppercase tracking-wider font-bold block">Assigned Position</span>
              <strong className="text-white text-sm mt-0.5 block">{selectedCandidate?.interview_title}</strong>
            </div>
            <div>
              <span className="text-[0.68rem] text-slate-400 uppercase tracking-wider font-bold block">AI Quality Score</span>
              <strong className="text-white text-sm mt-0.5 block">
                {selectedCandidate?.score != null ? `${Number(selectedCandidate.score).toFixed(1)}/100` : 'Not Evaluated'}
              </strong>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Interview QA Log</h4>
            <div className="flex flex-col gap-3.5">
              {candidateDetail?.answers?.map((ans, idx) => (
                <div key={idx} className="bg-slate-900/30 p-4 rounded-xl border border-white/5">
                  <p className="text-xs text-primary font-bold uppercase tracking-wider mb-1">Question {idx + 1}</p>
                  <p className="text-sm font-semibold text-white leading-relaxed">{ans.question_text}</p>
                  <div className="mt-3 pt-3 border-t border-white/5">
                    <span className="text-[0.68rem] text-slate-400 font-bold block uppercase tracking-wider mb-1">Candidate Answer</span>
                    <p className="text-sm text-slate-300 bg-black/20 p-3 rounded-lg border border-white/5 whitespace-pre-wrap leading-relaxed">{ans.answer_text || "-"}</p>
                  </div>
                </div>
              ))}
              {(!candidateDetail?.answers || candidateDetail.answers.length === 0) && (
                <p className="text-center py-6 text-slate-500 text-sm">No recorded answers available for this candidate.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function EmailPreviewModal({
  isOpen,
  onClose,
  emailTemplate,
  setEmailTemplate,
  buildEmailHtml,
  handleResetEmailPreview,
  handleSaveEmailPreview
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customize Invitation Email"
      subtitle="Edit the HTML body of the email. Key placeholders are dynamically parsed by the server."
      maxWidth="max-w-7xl"
      footer={
        <>
          <Button onClick={handleResetEmailPreview} variant="secondary">
            Reset to Default
          </Button>
          <Button onClick={handleSaveEmailPreview} variant="primary">
            Save Custom Template
          </Button>
        </>
      }
    >
      <div className="email-editor-layout">
        {/* Left Pane: HTML Editor */}
        <div className="email-pane">
          <div className="email-pane-header">
            <span>HTML Body Editor</span>
            <span className="email-pane-note">Changes sync immediately with preview</span>
          </div>
          <textarea
            className="email-text-editor"
            value={emailTemplate.bodyInnerHtml}
            onChange={(e) => setEmailTemplate(prev => ({ ...prev, bodyInnerHtml: e.target.value }))}
            placeholder="Write your email body HTML here..."
          />
        </div>
        {/* Right Pane: Live IFrame Preview */}
        <div className="email-pane">
          <div className="email-pane-header">
            <span>Live Email Preview</span>
          </div>
          <iframe
            className="email-preview-frame"
            title="Email Preview"
            srcDoc={buildEmailHtml()}
          />
        </div>
      </div>
    </Modal>
  )
}

export function BulkResultsModal({
  isOpen,
  onClose,
  bulkResultsData
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Invitation Results"
      subtitle={`Processed ${bulkResultsData?.total} candidates`}
      maxWidth="max-w-3xl"
      footer={
        <Button onClick={onClose} variant="primary">
          Close Results
        </Button>
      }
    >
      {bulkResultsData && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 text-center">
              <div className="text-[0.68rem] text-emerald-400 font-bold uppercase tracking-wider">Successful</div>
              <div className="text-3xl font-extrabold text-emerald-500 mt-1">{bulkResultsData.successful}</div>
            </div>
            <div className={`p-4 rounded-xl text-center border ${
              bulkResultsData.total - bulkResultsData.successful > 0
                ? 'bg-rose-500/5 border-rose-500/10 text-rose-500'
                : 'bg-slate-900/20 border-white/5 text-slate-400'
            }`}>
              <div className="text-[0.68rem] font-bold uppercase tracking-wider">Failed</div>
              <div className="text-3xl font-extrabold mt-1">{bulkResultsData.total - bulkResultsData.successful}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Detailed Logs</h4>
            <div className="border border-white/5 rounded-xl overflow-hidden bg-slate-900/10">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-900/40 border-b border-white/5 text-slate-400">
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Candidate</th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Detail / Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(bulkResultsData.results || []).map((res, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-xs text-slate-300">
                        <div className="font-bold text-white">{res.name}</div>
                        <div className="text-slate-400 mt-0.5">{res.email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <Badge variant={res.status === 'success' ? 'success' : 'danger'} text={res.status} />
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {res.status === 'success' ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              className="px-2.5 py-1 text-[0.7rem] h-[24px] border-white/10 hover:bg-white/10"
                              onClick={() => {
                                navigator.clipboard.writeText(res.link)
                                alert("Link copied!")
                              }}
                            >
                              Copy Link
                            </Button>
                          </div>
                        ) : (
                          <span className="text-rose-400">{res.error || 'Unknown error'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!bulkResultsData.results || bulkResultsData.results.length === 0) && (
                    <tr>
                      <td colSpan="3" className="text-center py-4 text-slate-500 text-xs font-semibold">No details available.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function LiveResultsModal({
  isOpen,
  onClose,
  ongoingLiveCount,
  ongoingAlertCount,
  ongoingSpeakingCount,
  ongoingCodingCount,
  liveSessions,
  handleOpenScorecard
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-success rounded-full animate-pulse" />
          Live Interview Room Monitor
        </span>
      }
      subtitle="Real-time monitoring of candidates currently attempting or configured for interviews"
      maxWidth="max-w-5xl"
      footer={
        <Button onClick={onClose} variant="primary">
          Close Monitor
        </Button>
      }
    >
      <div className="flex flex-col gap-6 text-slate-300">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl p-3.5 text-center">
            <div className="text-[0.68rem] text-[#16a34a] font-bold">ONLINE SESSIONS</div>
            <div className="text-2xl font-extrabold text-[#16a34a] mt-1">{ongoingLiveCount}</div>
          </div>
          <div className="bg-[#fef2f2] border border-[#fecaca] rounded-xl p-3.5 text-center">
            <div className="text-[0.68rem] text-[#ef4444] font-bold">PROCTORING ALERTS</div>
            <div className="text-2xl font-extrabold text-[#ef4444] mt-1">{ongoingAlertCount}</div>
          </div>
          <div className="bg-[#e0f2fe] border border-[#bae6fd] rounded-xl p-3.5 text-center">
            <div className="text-[0.68rem] text-[#0369a1] font-bold">CANDIDATES SPEAKING</div>
            <div className="text-2xl font-extrabold text-[#0369a1] mt-1">{ongoingSpeakingCount}</div>
          </div>
          <div className="bg-[#faf5ff] border border-[#f3e8ff] rounded-xl p-3.5 text-center">
            <div className="text-[0.68rem] text-[#7e22ce] font-bold">CODING ROUNDS</div>
            <div className="text-2xl font-extrabold text-[#7e22ce] mt-1">{ongoingCodingCount}</div>
          </div>
        </div>

        <div className="border border-[#e5edf7] rounded-xl overflow-hidden bg-white text-slate-800">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-[#e5edf7]">
                <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Candidate</th>
                <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Connection</th>
                <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Audio Status</th>
                <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Focus / Current Step</th>
                <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Proctoring Warnings</th>
                <th className="py-2.5 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f7]">
              {liveSessions.map((session, i) => (
                <tr key={session.session_id || session.id || i} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-xs">
                    <div className="font-bold text-slate-800">{session.candidate_name}</div>
                    <div className="text-slate-500 mt-0.5">{session.candidate_email}</div>
                    <div className="text-primary font-medium mt-0.5">{session.interview_title}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {session.online ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                        CONNECTED
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">OFFLINE</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {session.online ? (
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${Math.min(100, (session.audio_level || 0) * 10)}%` }} />
                        </div>
                        <span className={`font-semibold ${(session.audio_level || 0) > 5 ? 'text-primary' : 'text-slate-400'}`}>
                          {(session.audio_level || 0) > 5 ? 'Speaking' : 'Silent'}
                        </span>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 leading-normal">
                    {session.online ? (
                      <div>
                        <strong>Q{session.current_question_index || 1}</strong>: {session.current_question || 'Intro / Setup'}
                      </div>
                    ) : 'Session paused/not started'}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge variant={(session.proctoring_alerts || 0) > 0 ? 'danger' : 'success'} text={`${session.proctoring_alerts || 0} Alerts`} />
                  </td>
                  <td className="px-4 py-3 text-xs text-right">
                    <Button
                      variant="primary"
                      className="px-3 py-1.5 text-xs rounded h-[28px] font-bold"
                      onClick={() => {
                        onClose()
                        handleOpenScorecard(session)
                      }}
                    >
                      Monitor
                    </Button>
                  </td>
                </tr>
              ))}
              {liveSessions.length === 0 && (
                <tr>
                  <td colSpan="6" className="text-center py-10 text-slate-400 text-sm">
                    <Monitor size={36} className="mx-auto opacity-30 mb-2 block" />
                    No ongoing interviews right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
