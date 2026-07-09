import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Play, RefreshCw, User, Bot, Download, Star, UserPlus } from 'lucide-react';

export default function CallDetailsModal({ isOpen, onClose, callId, API_BASE_URL, token }) {
  const navigate = useNavigate();
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('chat'); // 'chat', 'analysis'

  useEffect(() => {
    if (isOpen && callId) {
      fetchCallDetails();
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in p-4">
      <div className="bg-[#111827] text-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col border border-white/10 overflow-hidden relative">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-bold">Call Details (ID: {callId})</h2>
          <div className="flex items-center gap-3">
            {details && details.internal_recording_url && (
              <div className="flex items-center gap-2 mr-4">
                <audio controls src={details.internal_recording_url} className="h-8 w-64" style={{ filter: 'invert(90%) hue-rotate(180deg)' }} />
                <a href={details.internal_recording_url} target="_blank" rel="noreferrer" className="p-1.5 bg-white/5 hover:bg-white/10 rounded text-slate-300 hover:text-white transition-colors" title="Download Recording">
                  <Download size={16} />
                </a>
              </div>
            )}
            <button onClick={fetchCallDetails} className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-sm font-semibold transition-colors">
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 text-sm font-semibold transition-colors">
              <Star size={14} /> Give Feedback
            </button>
            <button 
              onClick={() => {
                navigate('../create-interview', {
                  state: {
                    candidateData: {
                      name: details?.candidate_name || '',
                      phone: details?.phone_number || '',
                      jobDescription: details?.job_description || '',
                      resumeText: details?.resume_text || ''
                    }
                  }
                });
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 text-sm font-semibold transition-colors"
            >
              <UserPlus size={14} /> Invite to Interview
            </button>
            <div className="h-6 w-px bg-white/10 mx-1"></div>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-500 border-t-transparent"></div>
          </div>
        ) : !details ? (
          <div className="flex-1 flex items-center justify-center p-12 text-slate-400">
            Failed to load call details.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col bg-[#151b2b]">
            

            {/* Info Section */}
            <div className="grid grid-cols-3 gap-6 p-6 border-b border-white/5 bg-[#111827]">
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Source</div>
                <div className="font-semibold text-[15px] leading-tight">
                  {details.user_name || 'Candidate'}<br/>
                  <span className="text-slate-400 font-normal">{details.to_number}</span>
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Call Time</div>
                <div className="font-semibold text-[15px]">
                  {details.time_of_call}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Call Info</div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 text-[11px] font-bold bg-white/10 rounded uppercase">Call</span>
                  <span className={`px-2.5 py-1 text-[11px] font-bold rounded uppercase ${
                    details.call_status?.toLowerCase() === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                    details.call_status?.toLowerCase() === 'failed' ? 'bg-rose-500/20 text-rose-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {details.call_status?.toLowerCase() || 'completed'}
                  </span>
                  <span className="px-2.5 py-1 text-[11px] font-bold bg-white/10 rounded text-slate-300">
                    ⏱ {(details.duration || 0).toFixed(2)}s
                  </span>
                </div>
              </div>
            </div>

            {/* Tabs & Tab Content */}
            <div className="px-6 pt-2 border-b border-white/5 flex gap-1 bg-[#111827]">
              <button onClick={() => setActiveTab('chat')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'chat' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                Chat
              </button>
              <button onClick={() => setActiveTab('analysis')} className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'analysis' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}>
                Analysis
              </button>
            </div>

            <div className="p-6 flex-1 bg-[#151b2b]">
              {activeTab === 'chat' && (
                <div className="space-y-6 max-w-4xl mx-auto pb-10">
                  {details.interactions && details.interactions.length > 0 ? (
                    details.interactions.map((interaction, idx) => (
                      <div key={idx} className="flex flex-col gap-6">
                        
                        {/* Bot Message */}
                        {interaction.bot_response && (
                          <div className="flex gap-4">
                            <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center flex-shrink-0 font-bold border border-indigo-500/30 text-sm">
                              A
                            </div>
                            <div className="flex-1 bg-[#1a2333] border border-white/5 rounded-2xl rounded-tl-none p-4 shadow-sm">
                              <div className="flex items-baseline gap-2 mb-2">
                                <span className="font-bold text-[13px] text-white">Assistant</span>
                                <span className="text-[11px] text-slate-500">{interaction.time_of_call}</span>
                              </div>
                              <p className="text-slate-200 text-[15px] leading-relaxed whitespace-pre-wrap">{interaction.bot_response}</p>
                            </div>
                          </div>
                        )}

                        {/* User Message */}
                        {interaction.user_query && (
                          <div className="flex gap-4">
                            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 font-bold border border-emerald-500/30 text-sm">
                              U
                            </div>
                            <div className="flex-1 bg-[#1f2937] border border-white/5 rounded-2xl rounded-tl-none p-4 shadow-sm">
                              <div className="flex items-baseline gap-2 mb-2">
                                <span className="font-bold text-[13px] text-white">Caller</span>
                                <span className="text-[11px] text-slate-500">{interaction.time_of_call}</span>
                              </div>
                              <p className="text-slate-200 text-[15px] leading-relaxed whitespace-pre-wrap">{interaction.user_query}</p>
                            </div>
                          </div>
                        )}
                        
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-slate-500 py-10">
                      No interactions recorded for this call.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'analysis' && (
                <div className="max-w-4xl mx-auto space-y-6">
                  {details.sentiment_score !== undefined && (
                    <div className="bg-[#1a2333] border border-white/5 rounded-xl p-6">
                      <h4 className="font-bold text-slate-300 mb-2 uppercase text-xs tracking-wider">Sentiment Score</h4>
                      <div className="text-4xl font-black text-indigo-400">{details.sentiment_score}</div>
                    </div>
                  )}
                  {details.evaluation_remarks && (
                    <div className="bg-[#1a2333] border border-white/5 rounded-xl p-6">
                      <h4 className="font-bold text-slate-300 mb-3 uppercase text-xs tracking-wider">Evaluation Remarks</h4>
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{details.evaluation_remarks}</p>
                    </div>
                  )}
                  {details.summary && (
                    <div className="bg-[#1a2333] border border-white/5 rounded-xl p-6">
                      <h4 className="font-bold text-slate-300 mb-3 uppercase text-xs tracking-wider">Summary</h4>
                      <p className="text-slate-200 whitespace-pre-wrap leading-relaxed">{details.summary}</p>
                    </div>
                  )}
                  {(!details.sentiment_score && !details.evaluation_remarks && !details.summary) && (
                    <div className="text-center text-slate-500 py-10">
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
