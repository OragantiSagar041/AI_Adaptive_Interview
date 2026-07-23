import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, RefreshCw, ChevronDown, ChevronRight, CheckCircle2, XCircle, Plus, Trash2, GripVertical, ListOrdered } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../apiConfig';
import ErrorBoundary from '../../components/ErrorBoundary';

const DEFAULT_SECTIONS = [
  { id: 'sec-1', context_title: 'Identity & Purpose', context_body: 'You are an AI interviewer representing the engineering team. Your goal is to evaluate technical knowledge, communication skills, and problem solving abilities.', is_enabled: true },
  { id: 'sec-2', context_title: 'Personality', context_body: 'Maintain a professional, encouraging, and calm demeanor. Be polite, attentive, and objective in assessing responses.', is_enabled: true },
  { id: 'sec-3', context_title: 'Facts To Store', context_body: 'Record candidate candidate_name, total_experience_years, primary_skills, technical_depth_score, and communication_rating.', is_enabled: true },
  { id: 'sec-4', context_title: 'Actions & Limits', context_body: 'Do not disclose internal scoring benchmarks or offer salary details. If asked, politely state that HR will follow up.', is_enabled: true },
  { id: 'sec-5', context_title: 'Pre-call Checks', context_body: 'Ensure audio clarity and confirm candidate is ready and in a quiet environment before starting technical questions.', is_enabled: true },
  { id: 'sec-6', context_title: 'Greeting Flow', context_body: 'Greet the candidate warmly by name. Introduce yourself as the AI interviewer and briefly outline the interview structure.', is_enabled: true },
  { id: 'sec-7', context_title: 'Identity Verification & Consent', context_body: 'Confirm candidate full name and request explicit verbal consent for recording and evaluating the call session.', is_enabled: true },
  { id: 'sec-8', context_title: 'Warm-up', context_body: 'Ask the candidate to introduce themselves and highlight their recent relevant project or experience.', is_enabled: true },
  { id: 'sec-9', context_title: 'Information Collection', context_body: 'Gather details on current notice period, location preference, and key technologies used in their recent role.', is_enabled: true },
  { id: 'sec-10', context_title: 'Interview Mode & Question Flow', context_body: 'Ask targeted technical questions based on the candidate domain. Follow up on incomplete answers with probing questions.', is_enabled: true }
];

const generateSectionId = () => `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeTextValue = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
};

const normalizeFlowItem = (item, id) => ({
  id: id || generateSectionId(),
  context_title: normalizeTextValue(item.context_title ?? item.title),
  context_body: normalizeTextValue(item.context_body ?? item.instruction),
  is_enabled: typeof item.is_enabled === 'boolean' ? item.is_enabled : (typeof item.enabled === 'boolean' ? item.enabled : true),
});

export default function ConversationalFlowPage({ omniApiKey = '' }) {
  const [flowData, setFlowData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const dragItemIndex = useRef(null);
  const dragOverIndex = useRef(null);
  const [draggingId, setDraggingId] = useState(null);

  useEffect(() => {
    fetchFlowData();
  }, []);

  async function fetchFlowData() {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_BASE_URL}/admin/agent-flow`, {
        headers: omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {},
      });
      if (res.data.success && Array.isArray(res.data.flow) && res.data.flow.length > 0) {
        const normalizedFlow = res.data.flow.map((item, index) => normalizeFlowItem(item, item?.id ?? `sec-${index + 1}`));
        setFlowData(normalizedFlow);
      } else {
        setFlowData(DEFAULT_SECTIONS);
      }
    } catch (err) {
      console.log("Using default flow sections note:", err);
      setFlowData(DEFAULT_SECTIONS);
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      const payload = {
        flow: flowData.map((section) => ({
          title: section.context_title,
          body: section.context_body,
          context_title: section.context_title,
          context_body: section.context_body,
          is_enabled: section.is_enabled,
        })),
      };
      const res = await axios.put(`${API_BASE_URL}/admin/agent-flow`, payload, {
        headers: omniApiKey ? { 'X-Omni-Dimension-API-Key': omniApiKey } : {},
      });
      
      if (res.data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3500);
      }
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message ?? err?.message ?? err;
      setError(typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail));
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (id) => {
    setExpandedSections(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const updateSection = (index, field, value) => {
    const newData = [...flowData];
    newData[index][field] = value;
    setFlowData(newData);
  };

  const moveSection = (fromIndex, toIndex) => {
    const updated = [...flowData];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    setFlowData(updated);
  };

  const handleDragStart = (index, id) => {
    dragItemIndex.current = index;
    setDraggingId(id);
  };

  const handleDragEnter = (index) => {
    if (dragItemIndex.current === null || dragItemIndex.current === index) return;
    dragOverIndex.current = index;
    moveSection(dragItemIndex.current, index);
    dragItemIndex.current = index;
  };

  const handleDragEnd = () => {
    dragItemIndex.current = null;
    dragOverIndex.current = null;
    setDraggingId(null);
  };

  const removeSection = (index) => {
    const newData = flowData.filter((_, i) => i !== index);
    setFlowData(newData);
  };

  const addSection = () => {
    const newSection = {
      id: generateSectionId(),
      context_title: `New Flow Section`,
      context_body: '',
      is_enabled: true,
    };
    setFlowData([...flowData, newSection]);
    setExpandedSections(prev => ({ ...prev, [newSection.id]: true }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
        <span className="ml-3 text-slate-500 font-semibold text-sm">Loading Conversational Flow...</span>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="w-full max-w-[1200px] mx-auto py-4 px-2 sm:px-4 text-slate-800">
        
        {/* Alerts */}
        {error && (
          <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center text-rose-600 text-xs font-semibold">
            <XCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center text-emerald-600 text-xs font-semibold">
            <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />
            <p>Conversational flow saved & synced to Omni Dimension successfully!</p>
          </div>
        )}

        {/* Top Header */}
        <div className="flex items-center justify-between mb-5 bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
              <ListOrdered size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                Conversational Flow <span className="text-slate-400 text-[0.65rem] font-mono">ⓘ</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Order and configure your AI agent's structured conversation sections.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Saving...' : 'Save Flow'}
            </button>
            <button 
              onClick={addSection}
              className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              Add Section
            </button>
          </div>
        </div>

        {/* Sections List */}
        <div className="space-y-3">
          {flowData.map((section, index) => {
            const isExpanded = !!expandedSections[section.id];
            return (
              <div
                key={section.id || index}
                className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-sm ${
                  isExpanded ? 'border-indigo-400 ring-2 ring-indigo-500/10' : 'border-slate-200 hover:border-slate-300'
                } ${draggingId === section.id ? 'opacity-40' : ''}`}
                draggable
                onDragStart={() => handleDragStart(index, section.id)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
              >
                {/* Row Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-slate-50/80 border-b border-slate-100 select-none">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Expand/Collapse Chevron */}
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id)}
                      className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                    >
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </button>

                    {/* Drag Grip Handle */}
                    <div className="text-slate-400 hover:text-slate-600 cursor-move" title="Drag to reorder">
                      <GripVertical size={16} />
                    </div>

                    {/* Section Number & Title */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-500 font-mono shrink-0">{index + 1}.</span>
                      {isExpanded ? (
                        <input
                          type="text"
                          value={section.context_title}
                          onChange={(e) => updateSection(index, 'context_title', e.target.value)}
                          className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-xs font-bold text-slate-800 w-full max-w-md focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        />
                      ) : (
                        <span 
                          onClick={() => toggleSection(section.id)}
                          className="text-sm font-bold text-slate-800 tracking-wide truncate cursor-pointer hover:text-indigo-600 transition-colors"
                        >
                          {section.context_title}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Side Controls */}
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-2 select-none cursor-pointer" onClick={() => updateSection(index, 'is_enabled', !section.is_enabled)}>
                      <span className={`text-xs font-bold font-mono ${section.is_enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {section.is_enabled ? 'ON' : 'OFF'}
                      </span>
                      <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center ${
                        section.is_enabled ? 'bg-indigo-600 justify-end' : 'bg-slate-300 justify-start'
                      }`}>
                        <div className="w-3.5 h-3.5 bg-white rounded-full shadow-md" />
                      </div>
                    </div>

                    <button
                      onClick={() => removeSection(index)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Delete section"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* Expanded Content Area */}
                {isExpanded && (
                  <div className="p-5 bg-slate-50/50 border-t border-slate-100 space-y-3">
                    <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider">
                      Section Prompt Instructions & Context
                    </label>
                    <textarea
                      value={section.context_body}
                      onChange={(e) => updateSection(index, 'context_body', e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 min-h-[110px] resize-y font-mono leading-relaxed shadow-inner"
                      placeholder="Enter detailed instructions for this flow section..."
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom Add Section Button */}
        <button
          onClick={addSection}
          className="mt-5 w-full py-4 border-2 border-dashed border-slate-300 bg-white hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-600 text-slate-600 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer shadow-sm"
        >
          <Plus size={16} /> Add Section
        </button>
      </div>
    </ErrorBoundary>
  );
}
