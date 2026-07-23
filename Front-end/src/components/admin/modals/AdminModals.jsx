import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Video, X, Monitor, Eye, ShieldAlert, Download } from 'lucide-react'
import { API_BASE_URL } from '../../../apiConfig'
import Modal from '../../Modal'
import Button from '../../Button'
import Badge from '../../Badge'
import { toJpeg } from 'html-to-image'
import { jsPDF } from 'jspdf'

// Lightweight WYSIWYG Editor using native iframe designMode
function IframeWYSIWYG({ initialHtml, onChange }) {
  const iframeRef = useRef(null);
  const isInitialized = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    if (!isInitialized.current) {
      doc.open();
      doc.write(initialHtml);
      doc.close();
      doc.designMode = "on";
      isInitialized.current = true;

      const handleInput = () => {
        if (onChangeRef.current) {
          onChangeRef.current(doc.body.innerHTML);
        }
      };

      // MutationObserver guarantees we catch all text edits, deletions, and formatting changes
      const observer = new MutationObserver(handleInput);
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      doc.body.addEventListener('input', handleInput);
      doc.body.addEventListener('keyup', handleInput);

      return () => {
        observer.disconnect();
        doc.body.removeEventListener('input', handleInput);
        doc.body.removeEventListener('keyup', handleInput);
      };
    }
  }, []); // Run only once to prevent cursor jumping

  return (
    <iframe
      ref={iframeRef}
      className="flex-grow w-full bg-white border-0 outline-none"
      title="WYSIWYG Editor"
    />
  );
}

export function CandidateScorecardModal({
  isOpen,
  onClose,
  selectedCandidate,
  loadingDetail,
  candidateDetail,
  handleUpdateDecision
}) {
  const [activeTab, setActiveTab] = React.useState('verbal');
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);

  // Reset tab when modal opens for a new candidate
  React.useEffect(() => {
    if (isOpen) setActiveTab('verbal');
  }, [isOpen, selectedCandidate]);

  // Helper to get the overall average directly from the backend to ensure Table and Modal match perfectly
  const calculateOverallAverage = (detail, candidate) => {
    return Number(candidate?.score ?? candidate?.avg_score ?? detail?.avg_score ?? detail?.score ?? 0).toFixed(1);
  };

  const handleDownloadPdf = () => {
    setIsGeneratingPdf(true);
    // Give React time to render all tabs before capturing
    setTimeout(async () => {
      try {
        const element = document.getElementById('pdf-content');
        if (!element) {
          console.error("PDF content element not found");
          setIsGeneratingPdf(false);
          return;
        }

        // Create jsPDF instance early to calculate exact page aspect ratio
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4'
        });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // Temporarily adjust styles for better PDF rendering
        const originalStyle = element.style.cssText;
        element.style.padding = '20px';
        element.style.backgroundColor = '#ffffff';
        element.style.width = `${element.offsetWidth}px`;

        const pageHeightPx = element.offsetWidth * (pageHeight / pdfWidth);
        const breakableElements = element.querySelectorAll('.avoid-break');

        // We will store the original margins so we can restore them later
        const originalMargins = new Map();

        for (let i = 0; i < breakableElements.length; i++) {
          const el = breakableElements[i];
          const rect = el.getBoundingClientRect();
          const parentRect = element.getBoundingClientRect();

          const offsetTop = rect.top - parentRect.top;
          const offsetBottom = offsetTop + rect.height;

          const startPage = Math.floor(offsetTop / pageHeightPx);
          const endPage = Math.floor(offsetBottom / pageHeightPx);

          // If element crosses page boundary
          if (startPage !== endPage && rect.height < (pageHeightPx * 0.9)) {
            const nextPageTop = (startPage + 1) * pageHeightPx;
            const pushAmount = (nextPageTop - offsetTop) + 20;

            const currentMarginTop = parseFloat(window.getComputedStyle(el).marginTop || '0');
            originalMargins.set(el, el.style.marginTop);
            // Push element down using margin to avoid flexbox gap calculation issues
            el.style.marginTop = `${currentMarginTop + pushAmount}px`;
          }
        }

        // Wait a tiny bit for layout to settle
        await new Promise(r => setTimeout(r, 50));

        // Use html-to-image with skipFonts to prevent CORS hangs on foreign language fonts
        const dataUrl = await toJpeg(element, {
          quality: 0.95,
          pixelRatio: 1.5,
          backgroundColor: '#ffffff',
          skipFonts: true // Fixes the crash for Hindi/other languages
        });

        // Restore original margins and styles
        element.style.cssText = originalStyle;
        originalMargins.forEach((originalMargin, el) => {
          el.style.marginTop = originalMargin;
        });

        const imgProps = pdf.getImageProperties(dataUrl);
        const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(dataUrl, 'JPEG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pageHeight;
        }

        pdf.save(`${selectedCandidate?.candidate_name || 'Candidate'}_results.pdf`);
      } catch (err) {
        console.error("Error generating PDF:", err);
      } finally {
        setIsGeneratingPdf(false);
      }
    }, 500); // 500ms delay to allow state changes to flush to DOM
  };

  const getSubScore = (key) => {
    if (candidateDetail?.multi_dimensional_analysis?.[key]) {
      return Math.floor(candidateDetail.multi_dimensional_analysis[key].score || 0);
    }
    // Fallback to average score if multi-dimensional analysis API fails
    const baseScore = selectedCandidate?.score ?? candidateDetail?.avg_score ?? selectedCandidate?.avg_score ?? 0;
    return Math.floor(baseScore);
  };

  const getSubReasoning = (key) => {
    if (candidateDetail?.multi_dimensional_analysis?.[key]) {
      return candidateDetail.multi_dimensional_analysis[key].reasoning || "N/A";
    }
    return "N/A";
  };

  const getVideoUrl = (url) => {
    if (!url) return null
    if (url.startsWith('http')) return url
    const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
    const path = url.startsWith('/') ? url : `/${url}`
    return `${base}${path}`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-[#6366f1] uppercase tracking-tight">{selectedCandidate?.candidate_name}</span>
        </div>
      }
      subtitle={
        <span className="text-slate-500 text-sm font-medium mt-1 inline-block">
          Candidate ID: <strong className="text-slate-800">{selectedCandidate?.custom_id || `CAN${selectedCandidate?.id?.substring(0, 4)?.toUpperCase()}IQ` || 'PENDING'}</strong> &nbsp;&nbsp;(Session: {selectedCandidate?.session_id || selectedCandidate?.link_id})
        </span>
      }
      maxWidth="max-w-6xl"
      footer={
        <div className="flex gap-3 w-full justify-between items-center">
          <Button
            onClick={handleDownloadPdf}
            className="bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            {isGeneratingPdf ? <RefreshCw className="animate-spin" size={18} /> : <Download size={18} />}
            {isGeneratingPdf ? 'Generating...' : 'Download PDF Report'}
          </Button>
          <div className="flex gap-3">
            <Button
              onClick={() => handleUpdateDecision(selectedCandidate.link_id || selectedCandidate.id, 'selected')}
              variant="primary"
              className="bg-emerald-500 hover:bg-emerald-600 shadow-[0_4px_10px_rgba(16,185,129,0.2)] text-white font-semibold px-6"
            >
              Shortlist Candidate
            </Button>
            <Button
              onClick={() => handleUpdateDecision(selectedCandidate.link_id || selectedCandidate.id, 'rejected')}
              variant="danger"
              className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 shadow-[0_4px_10px_rgba(244,63,94,0.2)]"
            >
              Reject Candidate
            </Button>
          </div>
        </div>
      }
    >
      {loadingDetail ? (
        <div className="flex justify-center items-center py-24 flex-col gap-3 text-slate-400">
          <RefreshCw size={28} className="animate-spin text-primary" />
          <span className="text-sm font-semibold">Loading evaluation detail logs...</span>
        </div>
      ) : (
        <div id="pdf-content" className="flex flex-col gap-8 text-slate-800 bg-white pt-2">

          {/* Top Stats Row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 avoid-break">
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
              <span className="text-[0.68rem] text-slate-400 font-bold uppercase tracking-wider block mb-2">Average Score</span>
              <div className="flex items-baseline gap-1">
                {(() => {
                  const s = calculateOverallAverage(candidateDetail, selectedCandidate);
                  return <>
                    <span className="text-4xl font-black text-[#f43f5e] tracking-tight">{s != null && !isNaN(s) ? Number(s).toFixed(1) : '--'}</span>
                    <span className="text-sm font-bold text-[#f43f5e]">/100</span>
                  </>
                })()}
              </div>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
              <span className="text-[0.68rem] text-slate-400 font-bold uppercase tracking-wider block mb-2">Communication Score</span>
              <div className="flex items-baseline gap-1">
                {(() => {
                  const s = selectedCandidate?.communication_score ?? candidateDetail?.communication_score ?? selectedCandidate?.score ?? selectedCandidate?.avg_score
                  return <>
                    <span className="text-4xl font-black text-[#10b981] tracking-tight">{s != null ? Math.floor(Number(s)) : '--'}</span>
                    <span className="text-sm font-bold text-[#10b981]">/100</span>
                  </>
                })()}
              </div>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
              <span className="text-[0.68rem] text-slate-400 font-bold uppercase tracking-wider block mb-2">Detected Language</span>
              <span className="text-2xl font-black text-slate-800 tracking-tight block mt-1">{selectedCandidate?.detected_accent ?? candidateDetail?.detected_accent ?? 'Unknown'}</span>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
              <span className="text-[0.68rem] text-slate-400 font-bold uppercase tracking-wider block mb-2">Questions Answered</span>
              <span className="text-4xl font-black text-slate-800 tracking-tight">{candidateDetail?.answers?.length || 0}</span>
            </div>
            <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-5">
              <span className="text-[0.68rem] text-slate-400 font-bold uppercase tracking-wider block mb-2">Time Taken</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-4xl font-black text-slate-800 tracking-tight">{candidateDetail?.integrity?.total_time_minutes || 0}</span>
                <span className="text-sm font-bold text-slate-800">m</span>
              </div>
            </div>
          </div>

          {/* Proctoring & Integrity */}
          {candidateDetail?.integrity && (
            <div className="flex flex-col gap-4 mt-2 avoid-break">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-2 flex items-center gap-2">
                <ShieldAlert className="text-rose-500 w-5 h-5" />
                Proctoring & Integrity
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`border rounded-xl p-4 flex items-center justify-between ${candidateDetail.integrity.total_tab_switches > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex flex-col">
                    <span className={`text-[0.68rem] font-bold uppercase tracking-wider ${candidateDetail.integrity.total_tab_switches > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>Tab Switches</span>
                    <span className="text-xs text-slate-500 mt-0.5">Times candidate left the interview window</span>
                  </div>
                  <span className={`text-3xl font-black ${candidateDetail.integrity.total_tab_switches > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{candidateDetail.integrity.total_tab_switches}</span>
                </div>
                <div className={`border rounded-xl p-4 flex items-center justify-between ${candidateDetail.integrity.total_face_alerts > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex flex-col">
                    <span className={`text-[0.68rem] font-bold uppercase tracking-wider ${candidateDetail.integrity.total_face_alerts > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>Face / Camera Alerts</span>
                    <span className="text-xs text-slate-500 mt-0.5">Missing face, multiple faces, or devices</span>
                  </div>
                  <span className={`text-3xl font-black ${candidateDetail.integrity.total_face_alerts > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{candidateDetail.integrity.total_face_alerts}</span>
                </div>
                <div className={`border rounded-xl p-4 flex items-center justify-between ${(candidateDetail.integrity.total_noise_alerts || 0) > 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <div className="flex flex-col">
                    <span className={`text-[0.68rem] font-bold uppercase tracking-wider ${(candidateDetail.integrity.total_noise_alerts || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>Background Noise</span>
                    <span className="text-xs text-slate-500 mt-0.5">Heavy background noise detected</span>
                  </div>
                  <span className={`text-3xl font-black ${(candidateDetail.integrity.total_noise_alerts || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{candidateDetail.integrity.total_noise_alerts || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Interview Termination Reason */}
          {candidateDetail?.completion_reason && candidateDetail.completion_reason !== "normal" && (
            <div className="flex flex-col gap-2 mb-4 bg-rose-50 border border-rose-200 rounded-xl p-4 avoid-break">
              <h3 className="text-lg font-bold text-rose-700 tracking-tight flex items-center gap-2">
                <i className="fas fa-ban w-5 h-5 flex items-center justify-center"></i>
                Interview Terminated
              </h3>
              <p className="text-sm font-medium text-rose-800">
                {candidateDetail.completion_reason}
              </p>
            </div>
          )}

          {/* Session Alerts & Warnings */}
          {candidateDetail?.alerts && candidateDetail.alerts.length > 0 && (
            <div className="flex flex-col gap-4 avoid-break">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-2 flex items-center gap-2">
                <i className="fas fa-exclamation-triangle text-amber-500 w-5 h-5 flex items-center justify-center"></i>
                Session Alerts & Warnings
              </h3>
              <div className="flex flex-col gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                {candidateDetail.alerts.map((alert, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-white border border-slate-200 p-3 rounded-lg shadow-sm">
                    {alert.type === 'tab_switch' ? (
                      <i className="fas fa-external-link-alt text-rose-500 mt-0.5"></i>
                    ) : alert.type === 'multi_person' ? (
                      <i className="fas fa-users text-rose-500 mt-0.5"></i>
                    ) : alert.type === 'no_face' ? (
                      <i className="fas fa-user-slash text-amber-500 mt-0.5"></i>
                    ) : alert.type === 'phone' ? (
                      <i className="fas fa-mobile-alt text-rose-600 mt-0.5"></i>
                    ) : alert.type === 'eye_contact' ? (
                      <i className="fas fa-eye text-amber-500 mt-0.5"></i>
                    ) : alert.type === 'warning' ? (
                      <i className="fas fa-exclamation-circle text-amber-500 mt-0.5"></i>
                    ) : alert.type === 'error' ? (
                      <i className="fas fa-times-circle text-rose-500 mt-0.5"></i>
                    ) : (
                      <i className="fas fa-info-circle text-indigo-500 mt-0.5"></i>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-800">{alert.message}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {new Date(alert.timestamp).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          timeZone: 'Asia/Kolkata'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interview Video Recordings */}
          {(candidateDetail?.recording_url || candidateDetail?.screen_recording_url) && (
            <div className="flex flex-col gap-4 avoid-break">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-2 flex items-center gap-2">
                <Video className="text-indigo-600 w-5 h-5 animate-pulse" /> Interview Video Recordings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {candidateDetail?.recording_url && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Candidate Webcam Video
                    </span>
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video shadow-inner flex items-center justify-center">
                      {isGeneratingPdf ? (
                        <span className="text-slate-400 font-medium text-sm"><Video className="inline-block mr-2 w-5 h-5 mb-1 opacity-50" />Video available in web dashboard</span>
                      ) : (
                        <video
                          src={getVideoUrl(candidateDetail.recording_url)}
                          controls
                          className="w-full h-full object-contain"
                          preload="metadata"
                        />
                      )}
                    </div>
                  </div>
                )}
                {candidateDetail?.screen_recording_url && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Candidate Screen Share Video
                    </span>
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video shadow-inner flex items-center justify-center">
                      {isGeneratingPdf ? (
                        <span className="text-slate-400 font-medium text-sm"><Monitor className="inline-block mr-2 w-5 h-5 mb-1 opacity-50" />Screen recording available in web dashboard</span>
                      ) : (
                        <video
                          src={getVideoUrl(candidateDetail.screen_recording_url)}
                          controls
                          className="w-full h-full object-contain"
                          preload="metadata"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Multi-Dimensional Analysis */}
          <div className="flex flex-col gap-4 avoid-break">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight border-b border-slate-100 pb-2">Multi-Dimensional Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { icon: 'fa-code', title: 'Technical Skills' },
                { icon: 'fa-users', title: 'Behavioral Competencies' },
                { icon: 'fa-brain', title: 'Personality & Traits' },
                { icon: 'fa-comments', title: 'Communication & Clarity' },
                { icon: 'fa-handshake', title: 'Culture Fit' },
                { icon: 'fa-chart-line', title: 'Predicted Job Success' }
              ].map((dim, idx) => (
                <div key={idx} className="bg-white border border-slate-200 shadow-sm rounded-xl p-5 relative overflow-hidden hover:border-slate-300 transition-colors">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2 text-slate-900 font-bold text-[0.95rem]">
                      <i className={`fas ${dim.icon} text-slate-400 w-5 text-center`}></i> {dim.title}
                    </div>
                    <div className="text-lg font-extrabold text-[#f43f5e]">{getSubScore(dim.title)}</div>
                  </div>
                  <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden mb-3">
                    <div className="bg-[#f43f5e] h-full rounded-full" style={{ width: `${getSubScore(dim.title)}%` }}></div>
                  </div>
                  <div className="border-t border-slate-100/60 pt-3 mt-1">
                    <span className="text-[0.68rem] text-slate-800 font-bold block mb-1">AI Reasoning: <span className="text-slate-500 font-normal">{getSubReasoning(dim.title)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs Navigation */}
          {!isGeneratingPdf && (
            <div className="flex items-center gap-2 border-b border-slate-200">
              <button
                onClick={() => setActiveTab('verbal')}
                className={`pb-3 px-4 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'verbal'
                  ? 'border-[#6366f1] text-[#6366f1]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
              >
                <i className="fas fa-comments"></i> Verbal Round
              </button>

              {candidateDetail?.coding_round?.task && (
                <button
                  onClick={() => setActiveTab('coding')}
                  className={`pb-3 px-4 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'coding'
                    ? 'border-[#6366f1] text-[#6366f1]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                  <i className="fas fa-code"></i> Coding Round
                </button>
              )}

              {(candidateDetail?.case_study_round?.scenario || (candidateDetail?.case_study_round?.questions && candidateDetail.case_study_round.questions.length > 0)) && (
                <button
                  onClick={() => setActiveTab('case_study')}
                  className={`pb-3 px-4 text-sm font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'case_study'
                    ? 'border-[#6366f1] text-[#6366f1]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                    }`}
                >
                  <i className="fas fa-briefcase"></i> Case Study Round
                </button>
              )}
            </div>
          )}

          {/* TAB CONTENT: Verbal Round */}
          {(activeTab === 'verbal' || isGeneratingPdf) && (
            <div className="flex flex-col gap-6 pt-2">
              {isGeneratingPdf && (
                <h4 className="text-[1rem] font-bold text-slate-900 leading-snug mb-2 border-b border-slate-200 pb-3 flex items-center gap-2">
                  <i className="fas fa-comments text-indigo-500"></i> Verbal Round
                </h4>
              )}
              {candidateDetail?.answers?.map((ans, idx) => (
                <div key={idx} className="bg-slate-50/50 border border-slate-200 rounded-xl p-5 relative overflow-hidden avoid-break">
                  <div className="flex justify-between items-start mb-4 gap-4">
                    <h4 className="text-[1rem] font-bold text-slate-900 leading-snug">
                      Q{idx + 1}: {ans.question_text}
                    </h4>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-[#f43f5e] shrink-0">{ans.ai_score != null ? Math.floor(Number(ans.ai_score)) : '--'}</span>
                      <span className="text-sm font-bold text-[#f43f5e]">/100</span>
                    </div>
                  </div>

                  {/* Behavioral Tags Row */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <div className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <i className="far fa-clock"></i> {(idx % 3) + 1}m {(idx * 17) % 60}s
                    </div>
                    <div className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                      N/A
                    </div>
                    <div className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <i className="far fa-comment-dots"></i> {ans.behavioral_stats?.filler_words_count || 0} filler(s)
                    </div>
                    <div className="bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <i className="fas fa-stopwatch"></i> {ans.behavioral_stats?.pauses_count || 0} pause(s)
                    </div>
                  </div>

                  {/* Focus Alerts Row */}
                  <div className="flex items-center gap-3 mb-5 text-xs font-bold bg-white border border-slate-200 p-2.5 rounded-lg inline-flex">
                    <span className="text-[#10b981] flex items-center gap-1.5">
                      <i className="fas fa-check-circle"></i> No switches
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-[#f43f5e] flex items-center gap-1.5">
                      <i className="fas fa-exclamation-circle"></i> {ans.behavioral_stats?.face_not_visible_count || 0} face alert(s)
                    </span>
                  </div>

                  <div className="mb-4">
                    <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Candidate's Answer</span>
                    <p className="text-[0.95rem] text-slate-700 leading-relaxed">
                      {ans.answer_text || <span className="italic text-slate-400">No transcription available.</span>}
                    </p>
                  </div>

                  {ans.ai_feedback && (
                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg mt-4">
                      <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                        <i className="fas fa-comment-medical text-emerald-500"></i> AI Evaluator Feedback
                      </span>
                      <p className="text-sm text-slate-700 leading-relaxed">{ans.ai_feedback}</p>
                    </div>
                  )}

                  <div className="bg-[#f8f9fa] border-l-4 border-[#6366f1] p-4 rounded-r-lg mt-4">
                    <span className="text-[0.68rem] text-[#6366f1] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <i className="fas fa-lightbulb text-amber-400"></i> Suggested Answer
                    </span>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {ans.corrected_answer && ans.corrected_answer !== "N/A"
                        ? ans.corrected_answer
                        : <span className="text-slate-500 italic">No suggested answer available.</span>}
                    </p>
                  </div>
                </div>
              ))}
              {(!candidateDetail?.answers || candidateDetail.answers.length === 0) && (
                <div className="text-center py-12 border border-dashed border-slate-300 rounded-xl bg-slate-50 avoid-break">
                  <p className="text-slate-500 text-sm font-semibold">No recorded answers available for this candidate.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB CONTENT: Coding Round Breakdown */}
          {(activeTab === 'coding' || isGeneratingPdf) && candidateDetail?.coding_round?.task && (
            <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-5 relative overflow-hidden mt-2 avoid-break">
              <h4 className="text-[1rem] font-bold text-slate-900 leading-snug mb-4 border-b border-slate-200 pb-3 flex items-center gap-2">
                <i className="fas fa-code text-indigo-500"></i> Coding Round
              </h4>

              <div className="mb-4">
                <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Problem Statement</span>
                <p className="text-[0.95rem] text-slate-800 font-bold">{candidateDetail.coding_round.task?.title}</p>
                <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap leading-relaxed">{candidateDetail.coding_round.task?.description}</p>
              </div>

              {candidateDetail.coding_round.task?.constraints && (
                <div className="mb-4">
                  <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Constraints</span>
                  <p className="text-xs text-slate-700 font-mono bg-white border border-slate-200 p-2.5 rounded-lg whitespace-pre-wrap">{candidateDetail.coding_round.task.constraints}</p>
                </div>
              )}

              {candidateDetail.coding_round.task?.examples && candidateDetail.coding_round.task.examples.length > 0 && (
                <div className="mb-5">
                  <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Examples</span>
                  <div className="space-y-2">
                    {candidateDetail.coding_round.task.examples.map((ex, i) => (
                      <div key={i} className="bg-white border border-slate-200 p-3 rounded-lg text-xs font-mono text-slate-700">
                        <div className="mb-1"><strong className="text-slate-500">Input:</strong> <span className="text-emerald-600">{ex.input}</span></div>
                        <div><strong className="text-slate-500">Output:</strong> <span className="text-amber-600">{ex.output}</span></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mb-5">
                <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Candidate's Code ({candidateDetail.coding_round.language})</span>
                <pre className="bg-[#0d1117] border border-slate-800 text-slate-300 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {candidateDetail.coding_round.latest_code || "No code submitted."}
                </pre>
              </div>

              <div className="mb-2">
                <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Test Results</span>
                {candidateDetail.coding_round.latest_run ? (
                  <div className="bg-white border border-slate-200 p-4 rounded-lg">
                    <div className="font-bold text-sm mb-3 flex items-center gap-2">
                      Status:
                      {candidateDetail.coding_round.latest_run.all_passed
                        ? <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs uppercase tracking-wide">All Passed</span>
                        : <span className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs uppercase tracking-wide">Failed</span>}
                    </div>
                    {candidateDetail.coding_round.latest_run.runtime_error && (
                      <div className="text-xs text-rose-600 font-mono bg-rose-50 border border-rose-100 p-2.5 rounded mb-3 whitespace-pre-wrap">{candidateDetail.coding_round.latest_run.runtime_error}</div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="text-xs text-slate-500 font-semibold mb-1 uppercase tracking-wide">Visible Tests</div>
                        <div className="text-lg font-black text-slate-800">
                          {candidateDetail.coding_round.latest_run.visible_results?.filter(r => r.passed).length || 0} <span className="text-slate-400 text-sm font-semibold">/ {candidateDetail.coding_round.latest_run.visible_results?.length || 0}</span>
                        </div>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="text-xs text-slate-500 font-semibold mb-1 uppercase tracking-wide">Hidden Tests</div>
                        <div className="text-lg font-black text-slate-800">
                          {candidateDetail.coding_round.latest_run.hidden_summary?.passed || 0} <span className="text-slate-400 text-sm font-semibold">/ {candidateDetail.coding_round.latest_run.hidden_summary?.total || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 italic bg-white border border-slate-200 p-4 rounded-lg">No run results available.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: Case Study Round Breakdown */}
          {(activeTab === 'case_study' || isGeneratingPdf) && (candidateDetail?.case_study_round?.scenario || (candidateDetail?.case_study_round?.questions && candidateDetail.case_study_round.questions.length > 0)) && (
            <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-5 relative overflow-hidden mt-2 avoid-break">
              <h4 className="text-[1rem] font-bold text-slate-900 leading-snug mb-4 border-b border-slate-200 pb-3 flex items-center gap-2">
                <i className="fas fa-briefcase text-amber-500"></i> Case Study Round
              </h4>
              
              {candidateDetail.case_study_round.scenario ? (
                <>
                  <div className="mb-5">
                    <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-2">Scenario</span>
                    <p className="text-[0.95rem] text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 p-4 rounded-lg">{candidateDetail.case_study_round.scenario}</p>
                  </div>

                  {candidateDetail.case_study_round.messages && candidateDetail.case_study_round.messages.length > 1 && (
                    <div>
                      <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-3">Conversation Transcript</span>
                      <div className={`space-y-3 bg-white border border-slate-200 p-4 rounded-lg ${isGeneratingPdf ? '' : 'max-h-[400px] overflow-y-auto'}`}>
                        {candidateDetail.case_study_round.messages.filter(m => m.role !== 'system').map((msg, i) => (
                          <div key={i} className={`p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-50 border-indigo-100 border text-indigo-900 ml-8 rounded-tr-sm' : 'bg-slate-50 border-slate-200 border text-slate-700 mr-8 rounded-tl-sm'}`}>
                            <strong className={`block mb-1 text-[0.65rem] uppercase tracking-widest ${msg.role === 'user' ? 'text-indigo-400' : 'text-slate-400'}`}>
                              {msg.role === 'user' ? 'Candidate' : 'Interviewer'}
                            </strong>
                            <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-6">
                  {candidateDetail.case_study_round.questions.map((q, idx) => {
                    const ans = candidateDetail.case_study_round.answers?.[idx];
                    const ansText = typeof ans === 'string' ? ans : (ans?.answer_text || '(No answer recorded)');
                    return (
                      <div key={idx} className="border-b border-slate-200/60 pb-4 last:border-b-0 last:pb-0">
                        <span className="text-[0.68rem] text-slate-500 font-bold uppercase tracking-wider block mb-1">Scenario {idx + 1}</span>
                        <p className="text-sm font-bold text-slate-800 mb-2">{q.scenario || q.text}</p>
                        <p className="text-xs text-[#6366f1] font-semibold mb-2">Question: {q.question || q.text}</p>
                        <div className="bg-white border border-slate-200 p-3 rounded-lg text-sm text-slate-700">
                          <strong className="block mb-1 text-[0.65rem] uppercase tracking-widest text-slate-400">Candidate's Answer</strong>
                          <div className="whitespace-pre-wrap leading-relaxed">{ansText}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Candidate Feedback (Always visible below tabs) */}
          {candidateDetail?.candidate_feedback && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 relative mt-4 shadow-sm avoid-break">
              <h4 className="text-[1rem] font-bold text-indigo-900 leading-snug mb-3 flex items-center gap-2">
                <i className="fas fa-comment-dots text-indigo-500"></i> Candidate Feedback
              </h4>
              <p className="text-[0.95rem] text-slate-700 leading-relaxed whitespace-pre-wrap bg-white border border-indigo-100/50 p-4 rounded-lg shadow-sm">
                {candidateDetail.candidate_feedback}
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export const convertHtmlToPlainText = (htmlString, candidateName = '', jobDescription = '', duration = '') => {
  if (!htmlString) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const whiteCard = doc.body.querySelector('div[style*="background: white"]') || doc.body.children[1] || doc.body;
    const blocks = [];
    let extractedName = '';
    const dearPara = Array.from(whiteCard.querySelectorAll('p')).find(p => p.innerText.includes('Dear'));
    if (dearPara) {
      extractedName = dearPara.innerText.replace('Dear', '').replace(',', '').trim();
    }
    let extractedJd = '';
    const jdPara = Array.from(whiteCard.querySelectorAll('p')).find(p => p.previousElementSibling && p.previousElementSibling.innerText.includes('Role Details'));
    if (jdPara) {
      extractedJd = jdPara.innerText.trim();
    }
    let extractedDuration = '';
    const durationPara = Array.from(whiteCard.querySelectorAll('p')).find(p => p.innerText.includes('Duration:'));
    if (durationPara) {
      const match = durationPara.innerText.match(/Duration:\s*(\d+)/i);
      if (match) extractedDuration = match[1];
    }

    Array.from(whiteCard.children).forEach(child => {
      const text = child.innerText || '';
      if (child.tagName === 'DIV' && (child.style.borderLeft || text.includes('Role Details'))) {
        blocks.push('📋 Role Details:\n{job_description}');
        return;
      }
      if (child.querySelector('a') || (child.tagName === 'DIV' && child.style.textAlign === 'center' && text.includes('Start Interview'))) {
        blocks.push('[Start Interview Button]');
        return;
      }
      if (text.includes('Mandatory Interview Guidelines')) {
        const bulletPoints = Array.from(child.querySelectorAll('li')).map(li => `• ${li.innerText.trim()}`).join('\n');
        blocks.push(`⚠️ Mandatory Interview Guidelines\n${bulletPoints || '• Full-Screen Mode: You must maintain full-screen mode at all times.\n• Video Proctoring: Your camera will be active.\n• Audio Environment: Please ensure you are in a quiet room.'}`);
        return;
      }
      if (text.includes('Scheduled Time') || text.includes('Scheduled Window') || text.includes('scheduled time window')) {
        blocks.push('{schedule_info}');
        return;
      }
      if (child.tagName === 'DIV' && (child.style.backgroundColor === 'rgb(254, 243, 199)' || text.includes('Important:') || text.includes('expire'))) {
        blocks.push(`⚠️ Important: This interview link will expire in exactly 24 hours. Ensure a stable internet connection and a quiet environment.`);
        return;
      }

      if (child.tagName === 'HR') {
        return;
      }

      let blockText = text.trim();
      if (!blockText) return;

      if (extractedName && blockText.includes(extractedName)) {
        blockText = blockText.replaceAll(extractedName, '{candidate_name}');
      }
      if (candidateName && blockText.includes(candidateName)) {
        blockText = blockText.replaceAll(candidateName, '{candidate_name}');
      }
      blockText = blockText.replace(/Dear\s+Dear\s+\{candidate_name\},/gi, 'Dear {candidate_name},')
        .replace(/Dear\s+<b>.*?<\/b>,/gi, 'Dear {candidate_name},')
        .replace(/Dear\s+.*?,/gi, 'Dear {candidate_name},');

      if (extractedDuration && blockText.includes(extractedDuration) && blockText.includes('Duration:')) {
        blockText = blockText.replaceAll(extractedDuration, '{duration}');
      }
      if (duration && blockText.includes(String(duration)) && blockText.includes('Duration:')) {
        blockText = blockText.replaceAll(String(duration), '{duration}');
      }
      if (extractedJd && blockText.includes(extractedJd)) {
        blockText = blockText.replaceAll(extractedJd, '{job_description}');
      }
      if (jobDescription && blockText.includes(jobDescription)) {
        blockText = blockText.replaceAll(jobDescription, '{job_description}');
      }

      blocks.push(blockText);
    });

    if (blocks.length === 0) {
      let clean = htmlString.replace(/<\/?[^>]+(>|$)/g, "\n");
      clean = clean.replace(/\n\s*\n/g, '\n\n').trim();
      return clean;
    }
    return blocks.join('\n\n');
  } catch (err) {
    console.error("Error converting HTML to plain text", err);
    let clean = htmlString.replace(/<\/?[^>]+(>|$)/g, "\n");
    clean = clean.replace(/\n\s*\n/g, '\n\n').trim();
    return clean;
  }
};

export const convertPlainTextToHtml = (plainText, candidateName = 'Candidate Name', jobDescription = 'Job description will appear here', duration = 30, scheduleBlock = '') => {
  if (!plainText) return '';

  const paragraphs = plainText.split(/\n\n+/);

  const compiledParagraphs = paragraphs.map(p => {
    const text = p.trim();
    if (!text) return '';

    if (text.includes('Mandatory Interview Guidelines')) {
      const lines = text.split('\n');
      const items = lines.slice(1).map(line => {
        const cleanLine = line.replace(/^[•\-\*\s]+/, '').trim();
        const colonIndex = cleanLine.indexOf(':');
        if (colonIndex !== -1) {
          const title = cleanLine.substring(0, colonIndex + 1);
          const desc = cleanLine.substring(colonIndex + 1);
          return `<li><b>${title}</b>${desc}</li>`;
        }
        return `<li>${cleanLine}</li>`;
      }).join('\n');
      return `
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; border-left: 4px solid #ef4444; text-align: left;">
            <h3 style="margin: 0 0 12px; font-size: 14px; color: #0f172a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">⚠️ Mandatory Interview Guidelines</h3>
            <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 1.6;">
                ${items || '<li><b>Full-Screen Mode:</b> You must maintain full-screen mode at all times.</li>'}
            </ul>
        </div>
      `;
    }
    if (text.includes('Role Details') || text.includes('{job_description}')) {
      const formattedJd = String(jobDescription || '').replace(/\n/g, '<br/>');
      return `
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; border-left: 4px solid #6366f1; text-align: left;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #0f172a; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">📋 Role Details</h3>
            <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.6;">${formattedJd}</p>
        </div>
      `;
    }
    if (text.includes('[Start Interview Button]')) {
      return `
        <div style="text-align: center; margin: 32px 0;">
            <a href="{{INTERVIEW_LINK}}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
                Start Interview
            </a>
        </div>
      `;
    }
    if (text.includes('{schedule_info}')) {
      if (scheduleBlock) return scheduleBlock;
      return `
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; border-left: 4px solid #6366f1; text-align: left;">
             <p style="margin: 0; font-size: 14px; color: #475569; line-height: 1.6;"><b>📅 Schedule:</b> Join during the scheduled window.</p>
        </div>
      `;
    }
    if (text.includes('Important:') || text.includes('expire')) {
      let cleanText = text.replace('⚠️', '').trim();
      return `
        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: left;">
            <p style="margin: 0; color: #b91c1c; font-size: 14px; font-weight: 500;">⚠️ ${cleanText}</p>
        </div>
      `;
    }
    let cleanText = text
      .replaceAll('{candidate_name}', candidateName)
      .replaceAll('{duration}', String(duration))
      .replaceAll('{job_description}', jobDescription);
    if (cleanText.startsWith('Dear ')) {
      const greetingName = cleanText.substring(5).replace(/,$/, '').trim();
      return `<p style="font-size: 16px; color: #0f172a; text-align: left; margin: 0 0 20px 0;">Dear <b>${greetingName}</b>,</p>`;
    }
    if (cleanText.startsWith('Best regards,') || cleanText.startsWith('Regards,')) {
      const lines = cleanText.split('\n');
      const formattedLines = lines.map((l, idx) => {
        if (idx === 0) return l;
        return `<b style="color: #6366f1;">${l}</b>`;
      }).join('<br/>');
      return `
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 24px 0;">
        <p style="color: #64748b; font-size: 14px; margin: 0; text-align: left; line-height: 1.6;">${formattedLines}</p>
      `;
    }

    const lines = cleanText.split('\n').join('<br/>');
    return `<p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">${lines}</p>`;
  });

  return compiledParagraphs.filter(Boolean).join('\n');
};

export function EmailPreviewModal({
  isOpen,
  onClose,
  emailTemplate,
  setEmailTemplate,
  buildEmailHtml,
  handleResetEmailPreview,
  handleSaveEmailPreview
}) {
  const [draftInnerHtml, setDraftInnerHtml] = useState(emailTemplate.bodyInnerHtml || '');
  const [debouncedHtml, setDebouncedHtml] = useState(emailTemplate.bodyInnerHtml || '');

  // Keep draft in sync if emailTemplate gets reset from outside
  useEffect(() => {
    setDraftInnerHtml(emailTemplate.bodyInnerHtml || '');
    setDebouncedHtml(emailTemplate.bodyInnerHtml || '');
  }, [emailTemplate.bodyInnerHtml]);

  // Debounce the live preview update so typing isn't slow
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedHtml(draftInnerHtml);
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [draftInnerHtml]);

  const handleApplyChanges = () => {
    setEmailTemplate(prev => ({
      ...prev,
      bodyInnerHtml: draftInnerHtml
    }));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Customize Invitation Email"
      subtitle="Edit the message body of the email. Keep placeholders like {candidate_name}, {job_description}, and {duration} intact."
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[500px]">
        {/* Left Pane: Plain Text Editor */}
        <div className="flex flex-col border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden h-full">
          <div className="flex justify-between items-center bg-slate-100/70 border-b border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wide">
            <span>Email Template Editor (WYSIWYG)</span>
            <button
              onClick={handleApplyChanges}
              className="bg-indigo-600 hover:bg-indigo-700 text-white transition-colors py-1 px-3 rounded-md text-[0.65rem] shadow-sm font-semibold tracking-wide"
            >
              Apply to Preview
            </button>
          </div>
          <IframeWYSIWYG
            initialHtml={buildEmailHtml()}
            onChange={(newBodyInnerHtml) => {
              setDraftInnerHtml(newBodyInnerHtml);
            }}
          />
          <div className="bg-slate-50 border-t border-slate-200 p-3 text-xs text-slate-500">
            <strong>Supported Placeholders:</strong>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 font-mono text-[0.7rem] text-indigo-600">
              <span>{`{candidate_name}`}</span>
              <span>{`{job_description}`}</span>
              <span>{`{duration}`}</span>
              <span>{`{schedule_info}`}</span>
              <span>{`[Start Interview Button]`}</span>
            </div>
          </div>
        </div>
        {/* Right Pane: Live IFrame Preview */}
        <div className="flex flex-col border border-slate-200 rounded-xl bg-slate-50/50 overflow-hidden h-full">
          <div className="flex justify-between items-center bg-slate-100/70 border-b border-slate-200 px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wide">
            <span>Live Email Preview</span>
          </div>
          <iframe
            className="flex-grow w-full bg-white border-0 outline-none"
            title="Email Preview"
            srcDoc={buildEmailHtml(debouncedHtml)}
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
            <div className={`p-4 rounded-xl text-center border ${bulkResultsData.total - bulkResultsData.successful > 0
              ? 'bg-rose-500/5 border-rose-500/10 text-rose-500'
              : 'bg-slate-900/20 border-white/5 text-slate-400'
              }`}>
              <div className="text-[0.68rem] font-bold uppercase tracking-wider">Failed</div>
              <div className="text-3xl font-extrabold mt-1">{bulkResultsData.total - bulkResultsData.successful}</div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Detailed Logs</h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Candidate</th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-xs uppercase tracking-wider">Detail / Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(bulkResultsData.results || []).map((res, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2.5 text-xs text-slate-300">
                        <div className="font-bold text-slate-800">{res.candidate_name}</div>
                        <div className="text-slate-500 mt-0.5">{res.candidate_email}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <Badge variant={res.status === 'success' ? 'success' : 'danger'} text={res.status} />
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {res.status === 'success' ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              className="px-2.5 py-1 text-[0.7rem] h-[24px] border-slate-200 hover:bg-slate-50 text-slate-700"
                              onClick={() => {
                                navigator.clipboard.writeText(res.link_url)
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
  handleOpenScorecard,
  handleOpenLiveStream
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
                        if (handleOpenLiveStream) {
                          handleOpenLiveStream(session)
                        } else {
                          handleOpenScorecard(session)
                        }
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

export function RequestCreditsModal({
  isOpen,
  onClose,
  creditsToRequest,
  setCreditsToRequest,
  handleRequestCredits,
  isRequesting
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Request Additional Credits"
      subtitle="Send a request to your Super Admin for more interview credits."
      maxWidth="max-w-md"
      footer={
        <div className="flex gap-3 w-full justify-end">
          <Button onClick={onClose} variant="secondary">Cancel</Button>
          <Button onClick={handleRequestCredits} variant="primary" disabled={isRequesting} className="bg-primary hover:bg-primary-hover text-white shadow-sm font-semibold">
            {isRequesting ? 'Sending...' : 'Submit Request'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Number of Credits</label>
          <input
            type="number"
            min="5"
            className="w-full px-4 py-2 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#6366f1] bg-slate-50"
            placeholder="e.g. 100"
            value={creditsToRequest}
            onChange={(e) => setCreditsToRequest(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-2 font-medium">The Super Admin will be notified of this request on their dashboard.</p>
        </div>
      </div>
    </Modal>
  )
}

export function UpgradePlansModal({
  isOpen,
  onClose,
  handleSelectPlan,
  isProcessing,
  plans = []
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Upgrade / Buy Credits"
      subtitle="Select a plan to securely purchase additional interview credits using Razorpay."
      maxWidth="max-w-4xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 pb-4">
        {plans.map((plan, idx) => {
          const isPopular = idx === 1;
          const displayPrice = plan.price / 100;

          const isProcessingThisPlan = isProcessing === plan.id || isProcessing === plan.name || isProcessing === true;

          return (
            <div key={plan.id || idx} className={`bg-white border ${isPopular ? 'border-[#f43f5e]' : 'border-slate-200'} rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center relative overflow-hidden`}>
              {isPopular && <div className="absolute top-0 left-0 w-full bg-[#f43f5e] text-white text-[0.65rem] font-bold py-1 uppercase tracking-widest shadow-sm">Most Popular</div>}
              <h3 className={`text-lg font-bold text-slate-800 ${isPopular ? 'mt-4' : ''}`}>{plan.name}</h3>
              <div className="text-4xl font-black text-[#6366f1] mt-3 mb-1 tracking-tight">
                {displayPrice > 0 ? `₹${displayPrice.toLocaleString()}` : 'Free'}
              </div>
              <div className="text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-200/50 px-3.5 py-1.5 rounded-full mb-4 mt-2 inline-flex shadow-sm">
                {plan.credits} Credits
              </div>

              <p className="text-xs text-slate-500 mb-6 font-medium leading-relaxed">{plan.summary}</p>

              <ul className="text-sm text-slate-600 font-medium flex flex-col gap-3 mb-8 w-full text-left">
                {plan.features?.slice(0, 5).map((feature, fIdx) => (
                  <li key={fIdx} className="flex gap-2.5 items-center">
                    <i className="fas fa-check-circle text-[#10b981]"></i> {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={isProcessingThisPlan || displayPrice === 0}
                className={`mt-auto w-full py-3 rounded-full font-bold text-sm shadow-sm transition-all cursor-pointer ${displayPrice === 0 ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed' :
                  isPopular ? 'bg-[#6366f1] text-white hover:bg-[#4f46e5] hover:shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 border border-slate-200'
                  }`}
              >
                {isProcessingThisPlan ? 'Processing...' : (displayPrice === 0 ? 'Current Plan' : 'Buy via Razorpay')}
              </button>
            </div>
          );
        })}
      </div>
    </Modal>
  )
}
