import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, RefreshCw, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Plus, Trash2 } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../apiConfig';
import ErrorBoundary from '../../components/ErrorBoundary';

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

export default function ConversationalFlowPage() {
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

  const fetchFlowData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API_BASE_URL}/admin/agent-flow`);
      if (res.data.success) {
        const normalizedFlow = (res.data.flow || []).map((item, index) => normalizeFlowItem(item, item?.id ?? `section-${index}`));
        setFlowData(normalizedFlow);
        // Expand first section by default
        if (normalizedFlow.length > 0) {
          setExpandedSections({ [normalizedFlow[0].id]: true });
        }
      } else {
        const detail = res.data.detail || res.data.message || 'Failed to fetch agent flow';
        setError(typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail);
      }
    } catch (err) {
      console.error(err);
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message ?? err?.message ?? err;
      setError(typeof detail === 'object' ? JSON.stringify(detail, null, 2) : String(detail));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);
      
      const payload = {
        flow: flowData.map((section) => ({
          // include both legacy and normalized fields to satisfy backend validation
          title: section.context_title,
          body: section.context_body,
          context_title: section.context_title,
          context_body: section.context_body,
          is_enabled: section.is_enabled,
        })),
      };
      const res = await axios.put(`${API_BASE_URL}/admin/agent-flow`, payload);
      
      if (res.data.success) {
        await fetchFlowData();
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
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
      context_title: 'New Section',
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
        <span className="ml-3 text-slate-400">Loading agent flow...</span>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center">
            <Settings className="w-6 h-6 mr-3 text-indigo-400" />
            Conversational Flow
          </h1>
          <p className="text-slate-400 mt-1">Configure your Omnidimension AI agent's instructions and conversation flow.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={fetchFlowData}
            className="px-4 py-2 bg-slate-800 text-slate-300 hover:text-white rounded-lg transition-colors flex items-center"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reload
          </button>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Flow
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center text-rose-400">
          <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center text-emerald-400">
          <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0" />
          <p>Conversational flow synced to Omnidimension successfully!</p>
        </div>
      )}

      <div className="space-y-4">
        {flowData.map((section, index) => (
          <div
            key={section.id || index}
            className={`bg-slate-800 border border-slate-700 rounded-lg overflow-hidden transition-all ${draggingId === section.id ? 'opacity-60' : ''}`}
            draggable
            onDragStart={() => handleDragStart(index, section.id)}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={() => handleDragEnter(index)}
            onDragEnd={handleDragEnd}
          >
            {/* Header */}
            <div 
              className="flex items-center justify-between p-4 cursor-move hover:bg-slate-750"
              onClick={() => toggleSection(section.id)}
              role="button"
              tabIndex={0}
              aria-expanded={expandedSections[section.id] ? 'true' : 'false'}
              aria-label={`Toggle section ${index + 1}`}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleSection(section.id);
                }
              }}
            >
              <div className="flex items-center space-x-4">
                {expandedSections[section.id] ? 
                  <ChevronUp className="w-5 h-5 text-slate-400" /> : 
                  <ChevronDown className="w-5 h-5 text-slate-400" />
                }
                <span className="text-slate-500 font-mono text-sm">{index + 1}.</span>
                {expandedSections[section.id] ? (
                  <input
                    type="text"
                    value={section.context_title}
                    onChange={(e) => updateSection(index, 'context_title', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-slate-900 border border-slate-700 rounded px-3 py-1 text-white text-sm focus:outline-none focus:border-indigo-500"
                  />
                ) : (
                  <h3 className="text-white font-medium">{section.context_title}</h3>
                )}
              </div>
              
              <div className="flex items-center space-x-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400 font-medium">{section.is_enabled ? 'ON' : 'OFF'}</span>
                  <button
                    onClick={() => updateSection(index, 'is_enabled', !section.is_enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${section.is_enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
                    aria-label={`Toggle section ${index + 1} enabled state`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${section.is_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>
                <button 
                  onClick={() => removeSection(index)}
                  className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-700 transition-colors"
                  aria-label={`Remove section ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            {expandedSections[section.id] && (
              <div className="p-4 border-t border-slate-700 bg-slate-900/50">
                <textarea
                  value={section.context_body}
                  onChange={(e) => updateSection(index, 'context_body', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-300 text-sm focus:outline-none focus:border-indigo-500 min-h-[150px] resize-y font-mono"
                  placeholder="Enter instructions for this section..."
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={addSection}
        className="mt-6 w-full py-4 border-2 border-dashed border-slate-700 hover:border-indigo-500 hover:text-indigo-400 text-slate-500 rounded-lg flex items-center justify-center transition-colors"
      >
        <Plus className="w-5 h-5 mr-2" />
        Add Section
      </button>
      </div>
    </ErrorBoundary>
  );
}
