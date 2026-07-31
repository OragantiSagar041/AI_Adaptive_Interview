import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Play, Pause, RefreshCw, Star, Download, Clock } from 'lucide-react';
import { parseDateStringToUtc } from '../../utils/adminFormatters';

export default function CallDetailsModal({ isOpen, onClose, callId, API_BASE_URL, token }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'replay', 'analysis', 'post actions', 'latency profile'
  const [viewMode, setViewMode] = useState('simple'); // 'simple', 'advanced'
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      const duration = audioRef.current.duration || 1; // prevent NaN
      setProgress((current / duration) * 100);
    }
  };

  const handleSeek = (e) => {
    if (audioRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percentage = clickX / rect.width;
      audioRef.current.currentTime = percentage * audioRef.current.duration;
    }
  };

  const handleDownload = async () => {
    const url = details.internal_recording_url || details.recording_url;
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `recording_${callId}.wav`; // or .mp3
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error("Direct download failed, falling back to new tab:", error);
      window.open(url, '_blank');
    }
  };

  useEffect(() => {
    if (isOpen && callId) {
      fetchCallDetails();
      // Reset audio state when opening a new call
      setIsPlaying(false);
      setProgress(0);
    }
  }, [isOpen, callId]);

  const fetchCallDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/calls/logs/${callId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setDetails(data.log);
      } else {
        console.error("Error fetching call details:", data.detail);
      }
    } catch (e) {
      console.error("Failed to fetch details", e);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Unknown Date';
    const d = parseDateStringToUtc(dateStr)
    if (!d || isNaN(d)) return dateStr;
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'long',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white text-slate-900 w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col border border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">Call Details (ID: {callId})</h2>
          <div className="flex items-center gap-4">
            <button onClick={fetchCallDetails} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-600 transition-colors">
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-teal-500/30 text-teal-500 hover:bg-teal-500/10 text-xs font-semibold transition-colors">
              <Star size={12} /> Give Feedback
            </button>
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              Mode:
              <div className="flex bg-slate-50 rounded overflow-hidden border border-slate-200">
                <button
                  onClick={() => setViewMode('simple')}
                  className={`px-4 py-1.5 transition-colors ${viewMode === 'simple' ? 'bg-teal-500 text-black' : 'hover:text-slate-900'}`}
                >
                  Simple
                </button>
                <button
                  onClick={() => setViewMode('advanced')}
                  className={`px-4 py-1.5 transition-colors ${viewMode === 'advanced' ? 'bg-teal-500 text-black' : 'hover:text-slate-900'}`}
                >
                  Advanced
                </button>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-900 transition-colors ml-2">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal-500 border-t-transparent"></div>
          </div>
        ) : !details ? (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Failed to load call details.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-white">

            {/* Audio Player Wrapper */}
            <div className="p-4 bg-white">
              <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <button onClick={togglePlay} className="text-slate-500 hover:text-slate-900">
                  {isPlaying ? <Pause size={16} className="fill-current" /> : <Play size={16} className="fill-current" />}
                </button>
                <div onClick={handleSeek} className="flex-1 relative flex items-center h-4 cursor-pointer">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full h-[2px] bg-slate-300 rounded-full"></div>
                  </div>
                  <div className="absolute left-0 flex items-center h-full" style={{ width: `${progress}%` }}>
                    <div className="absolute left-0 w-full h-[2px] bg-teal-500 rounded-full"></div>
                    <div className="absolute right-0 w-2.5 h-2.5 bg-teal-500 rounded-full shadow border-2 border-white translate-x-1/2"></div>
                  </div>
                </div>
                <button onClick={handleDownload} className="text-slate-500 hover:text-slate-900" title="Download Recording">
                  <Download size={16} />
                </button>
              </div>
              <audio
                ref={audioRef}
                src={details.internal_recording_url || details.recording_url}
                onTimeUpdate={handleTimeUpdate}
                onEnded={() => setIsPlaying(false)}
                className="hidden"
              />
            </div>

            {/* Info Section */}
            <div className="grid grid-cols-4 gap-6 px-6 pb-4 border-b border-slate-200 bg-white">
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-bold text-slate-500 mb-1">Source</div>
                <div className="font-bold text-sm text-slate-900">
                  {details.bot_name || 'Arah InfoTech Screening Interviewer (Sarah)'}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-bold text-slate-500 mb-1">Call Time</div>
                <div className="font-bold text-sm text-slate-900">
                  {formatDate(details.time_of_call)}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-bold text-slate-500 mb-1">Call Info</div>
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold border border-slate-300 rounded text-slate-700 bg-slate-100">Call</span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded text-black bg-red-400">{details.call_status || 'completed'}</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-600">
                    <Clock size={10} /> {details.call_duration || '00:00'}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-[11px] font-bold text-slate-500 mb-1">Ended By</div>
                <div className="font-bold text-sm text-slate-900">
                  {details.hangup_source || 'Timeout'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {details.hangup_reason || 'Session timeout'}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="px-6 flex gap-6 bg-white">
              {['Chat', 'Replay', 'Analysis', 'Post Actions', 'Latency Profile'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`py-3 text-[11px] font-bold transition-colors border-b-2 ${activeTab === tab.toLowerCase() ? 'border-teal-500 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="flex-1 bg-white border-t border-slate-200">
              {activeTab === 'chat' && (
                <div className="p-6">
                  {details.interactions && details.interactions.length > 0 ? (
                    <div className="flex flex-col gap-3 max-w-4xl">
                      {details.interactions.map((interaction, idx) => (
                        <div key={idx} className="flex flex-col gap-3">

                          {viewMode === 'simple' && (
                            <>
                              {/* Assistant Bubble */}
                              {interaction.bot_response && (
                                <div className="flex flex-col bg-teal-50 rounded-lg p-4 border border-teal-100">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-5 h-5 rounded-full bg-slate-50 border border-gray-700 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                      A
                                    </div>
                                    <span className="font-bold text-xs text-slate-900">Assistant</span>
                                    <span className="text-[10px] text-slate-400">{formatDate(interaction.time_of_call)}</span>
                                  </div>
                                  <p className="text-sm text-slate-800 leading-relaxed ml-7 whitespace-pre-wrap">{interaction.bot_response}</p>
                                </div>
                              )}

                              {/* Caller Bubble */}
                              {interaction.user_query && (
                                <div className="flex flex-col bg-slate-50 rounded-lg p-4 border border-slate-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-[10px] font-bold text-black">
                                      U
                                    </div>
                                    <span className="font-bold text-xs text-slate-900">Caller</span>
                                    <span className="text-[10px] text-slate-400">{formatDate(interaction.time_of_call)}</span>
                                  </div>
                                  <p className="text-sm text-slate-800 leading-relaxed ml-7 whitespace-pre-wrap">{interaction.user_query}</p>
                                </div>
                              )}
                            </>
                          )}

                          {viewMode === 'advanced' && (
                            <div className="flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
                              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm text-slate-900">Interaction #{interaction.interaction_sequence || idx + 1}</span>
                                  <span className="text-[11px] text-slate-400">{formatDate(interaction.time_of_call)}</span>
                                </div>
                                <div className="flex flex-col items-end text-[11px] text-slate-500">
                                  <span>Total Response Time: <strong className="text-slate-900">{(interaction.total_response_time || 0).toFixed(2)}s</strong></span>
                                  <span>Total Tokens: <strong className="text-slate-900">{interaction.total_tokens || 0}</strong></span>
                                </div>
                              </div>

                              <div className="p-4 flex flex-col gap-4">
                                {/* Assistant Bubble inside Advanced */}
                                {interaction.bot_response && (
                                  <div className="flex flex-col bg-teal-50 rounded-lg p-4 border border-teal-100">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="font-bold text-xs text-slate-900">Assistant</span>
                                    </div>
                                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{interaction.bot_response}</p>
                                  </div>
                                )}

                                {/* Metric Grid */}
                                <div className="grid grid-cols-4 gap-3">
                                  {['Intent Score', 'Relevance Score', 'Coherence Score', 'Latency Score'].map(metric => (
                                    <div key={metric} className="border border-slate-200 bg-slate-50 rounded-lg p-3 flex flex-col justify-between h-20">
                                      <span className="text-[10px] font-bold text-slate-900">{metric}</span>
                                      <span className="text-lg font-bold text-slate-900 self-end">{Number(interaction[`metric_score_${metric.split(' ')[0].toLowerCase()}`] || 0).toFixed(2)}</span>
                                    </div>
                                  ))}
                                  <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 flex flex-col justify-between h-20">
                                    <span className="text-[10px] font-bold text-slate-900">LLM Latency Score</span>
                                    <span className="text-lg font-bold text-slate-900 self-end">{Number(interaction.llm2_time || 0).toFixed(2)}s</span>
                                  </div>
                                  <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 flex flex-col justify-between h-20">
                                    <span className="text-[10px] font-bold text-slate-900">ASR Latency Score</span>
                                    <span className="text-lg font-bold text-slate-900 self-end">{Number(interaction.asr_time || 0).toFixed(2)}s</span>
                                  </div>
                                  <div className="border border-slate-200 bg-slate-50 rounded-lg p-3 flex flex-col justify-between h-20">
                                    <span className="text-[10px] font-bold text-slate-900">TTS Latency Score</span>
                                    <span className="text-lg font-bold text-slate-900 self-end">{Number(interaction.tts_time || 0).toFixed(2)}s</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-slate-400 py-10">
                      No interactions recorded for this call.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'analysis' && (
                <div className="max-w-4xl mx-auto space-y-6 p-6">
                  {details.sentiment_score !== undefined && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h4 className="font-bold text-slate-500 mb-2 uppercase text-xs tracking-wider">Sentiment Score</h4>
                      <div className="text-4xl font-black text-teal-500">{details.sentiment_score}</div>
                    </div>
                  )}
                  {details.evaluation_remarks && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h4 className="font-bold text-slate-500 mb-3 uppercase text-xs tracking-wider">Evaluation Remarks</h4>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{details.evaluation_remarks}</p>
                    </div>
                  )}
                  {details.summary && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                      <h4 className="font-bold text-slate-500 mb-3 uppercase text-xs tracking-wider">Summary</h4>
                      <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{details.summary}</p>
                    </div>
                  )}
                  {(!details.sentiment_score && !details.evaluation_remarks && !details.summary) && (
                    <div className="text-center text-slate-400 py-10">
                      No advanced analysis available for this call.
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
