import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Maximize2, Minimize2, Loader2, Sparkles, Paperclip, Trash2, History, Plus, ChevronLeft, Clock } from 'lucide-react';
import { 
  adminCopilotChat, 
  getCopilotSessions, 
  createCopilotSession, 
  getCopilotSessionDetail, 
  deleteCopilotSession 
} from '../../../utils/api';
import { API_BASE_URL } from '../../../apiConfig';
import CopilotActionCard from './CopilotActionCard';
import { useSelector } from 'react-redux';

const AdminCopilot = () => {
  const user = useSelector(state => state.auth.adminUser);
  const authRole = useSelector(state => state.auth.role);
  
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello ${user?.name || 'Admin'}! I'm the Hire IQ Copilot. How can I help you today?`
    }
  ]);
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFileText, setAttachedFileText] = useState(null);
  const [attachedFileName, setAttachedFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const role = authRole || 'admin';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  // Fetch MongoDB Sessions on copilot open
  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen]);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await getCopilotSessions();
      if (res.sessions && res.sessions.length > 0) {
        setSessions(res.sessions);
        if (!currentSessionId) {
          selectSession(res.sessions[0].session_id);
        }
      } else {
        handleNewChat();
      }
    } catch (err) {
      console.error("Failed to load Copilot sessions:", err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const selectSession = async (sessionId) => {
    setCurrentSessionId(sessionId);
    setShowSidebar(false);
    setIsLoading(true);
    try {
      const detail = await getCopilotSessionDetail(sessionId);
      if (detail.session && detail.session.messages) {
        setMessages(detail.session.messages);
      }
    } catch (err) {
      console.error("Failed to fetch session detail:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = async () => {
    setIsLoading(true);
    try {
      const res = await createCopilotSession();
      if (res.session) {
        setSessions(prev => [res.session, ...prev]);
        setCurrentSessionId(res.session.session_id);
        setMessages(res.session.messages || []);
        setShowSidebar(false);
      }
    } catch (err) {
      console.error("Failed to create new chat session:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await deleteCopilotSession(sessionId);
      const updated = sessions.filter(s => s.session_id !== sessionId);
      setSessions(updated);
      if (currentSessionId === sessionId) {
        if (updated.length > 0) {
          selectSession(updated[0].session_id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  const handleSend = async (overrideText = null) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : inputValue;
    if (!textToSend.trim() && !attachedFileText) return;

    let finalMessage = textToSend.trim();
    if (attachedFileText) {
      finalMessage += `\n\n[Attached File: ${attachedFileName}]\n${attachedFileText}`;
    }

    const userMessage = { role: 'user', content: finalMessage };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setAttachedFileText(null);
    setAttachedFileName('');
    setIsLoading(true);

    const lowerText = textToSend.toLowerCase();

    // Offline Interceptor: Buy Credits
    const buyMatch = lowerText.match(/buy.*?(\d+)/);
    if (buyMatch || lowerText.includes("buy credit")) {
      const amount = buyMatch ? parseInt(buyMatch[1], 10) : 100;
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `I can help you purchase credits. Please review and confirm the transaction below:`,
          actionRequired: {
            action: "buy_credits",
            amount: amount,
            admin_username: user?.username || "",
            reason: "Purchase via platform"
          }
        }]);
        setIsLoading(false);
      }, 600);
      return;
    }

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      const response = await adminCopilotChat({
        message: userMessage.content,
        history: history,
        session_id: currentSessionId
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.reply,
        actionRequired: response.action_required
      }]);

      fetchSessions();
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error.message || 'Failed to connect to Copilot.'}`
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestionClick = (suggestion) => {
    handleSend(suggestion);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'resume');
      
      const response = await fetch(`${API_BASE_URL}/admin/parse-resume`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: formData
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Failed to parse file');
      
      setAttachedFileText(data.text);
      setAttachedFileName(file.name);
    } catch (error) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error uploading file: ${error.message}`
      }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = () => {
    setAttachedFileText(null);
    setAttachedFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getSuggestions = () => {
    if (role === 'super_admin') {
      return [
        "Buy credits",
        "Transfer 50 credits to admin user123",
        "How many sub-admins do I have?",
      ];
    }
    if (role === 'master') {
      return [
        "Show me total platform revenue",
        "How many total interviews are completed?",
        "How many active super admins?"
      ];
    }
    // Default admin
    return [
      "Request credits from super admin",
      "Draft feedback email for top candidate",
      "How does ATS scoring work?"
    ];
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-1 transition-all duration-300 z-50 group flex items-center justify-center"
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap pl-0 group-hover:pl-2 font-medium">
          Hire IQ Copilot
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 flex flex-col bg-white border border-slate-200/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden z-50 transition-all duration-300 ease-in-out ${isExpanded ? 'w-[520px] h-[720px]' : 'w-[380px] h-[580px]'}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-3.5 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full"></div>
        <div className="flex items-center gap-2.5 relative z-10">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            title="Chat History Sessions"
            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <History className="w-4 h-4 text-indigo-600" />
          </button>

          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-xs leading-tight">Hire IQ Copilot</h3>
            <p className="text-[10px] text-slate-500 capitalize">{role} Assistant</p>
          </div>
        </div>

        <div className="flex items-center gap-1 relative z-10 text-slate-400">
          <button 
            onClick={handleNewChat} 
            title="New Chat Session" 
            className="p-1.5 hover:bg-indigo-50 hover:text-indigo-600 rounded-md transition-colors text-slate-600 flex items-center gap-1 text-xs font-medium"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors">
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area (Sidebar Drawer + Chat) */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        
        {/* History Sidebar Drawer */}
        {showSidebar && (
          <div className="absolute inset-0 bg-white z-20 flex flex-col border-r border-slate-100 animate-in slide-in-from-left duration-200">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowSidebar(false)} className="p-1 hover:bg-slate-200 rounded-md">
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <span className="text-xs font-semibold text-slate-700">Chat History</span>
              </div>
              <button 
                onClick={handleNewChat}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3 h-3" /> New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {loadingSessions ? (
                <div className="flex justify-center items-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No saved chat sessions.</p>
              ) : (
                sessions.map(s => (
                  <div
                    key={s.session_id}
                    onClick={() => selectSession(s.session_id)}
                    className={`group p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                      currentSessionId === s.session_id
                        ? 'bg-indigo-50/60 border-indigo-200/60 text-indigo-900 font-semibold'
                        : 'border-transparent hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${currentSessionId === s.session_id ? 'text-indigo-600' : 'text-slate-400'}`} />
                      <div className="truncate">
                        <p className="text-xs truncate">{s.title || 'Untitled Session'}</p>
                        <p className="text-[10px] text-slate-400 font-normal flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {s.updated_at ? new Date(s.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(e, s.session_id)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-600 rounded text-slate-400 transition-all"
                      title="Delete Session"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
          {messages.map((msg, index) => (
          <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <Bot className="w-4 h-4 text-indigo-500" />
              </div>
            )}
            
            <div className={`max-w-[88%] w-full flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`p-3 rounded-2xl text-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-200/50' 
                  : 'bg-white text-slate-700 border border-slate-200/60 rounded-tl-sm shadow-sm'
              }`}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
              
              {/* Render Action Card if present */}
              {msg.actionRequired && (
                <div className="w-full mt-2">
                  <CopilotActionCard actionRequired={msg.actionRequired} />
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-indigo-600 shadow-sm flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
              <Bot className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="bg-white border border-slate-200/60 p-3 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              <span className="text-sm text-slate-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions */}
      {messages.length < 3 && !isLoading && (
        <div className="px-4 py-3 flex flex-wrap gap-2 shrink-0 border-t border-slate-100 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.02)] z-10 relative">
          {getSuggestions().map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => handleSuggestionClick(suggestion)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-full text-[11px] text-slate-600 hover:text-slate-800 transition-colors shadow-sm text-left leading-tight max-w-full"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-100 shrink-0 flex flex-col gap-2">
        {/* Attachment preview */}
        {attachedFileName && (
          <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg p-2 px-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-[11px] font-medium text-indigo-700 truncate">{attachedFileName}</span>
            </div>
            <button onClick={removeAttachment} className="p-1 hover:bg-indigo-100 rounded-md text-indigo-500 transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all shadow-inner">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept=".pdf,.doc,.docx,.txt"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || isUploading}
            className={`p-2.5 rounded-lg shrink-0 mb-0.5 ml-0.5 transition-colors ${
              isUploading 
                ? 'text-indigo-400 bg-indigo-50' 
                : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-200/50'
            }`}
            title="Attach Resume or Document"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>

          <textarea
            id="copilot-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Copilot..."
            className="flex-1 max-h-32 min-h-[40px] bg-transparent text-sm text-slate-800 placeholder:text-slate-400 resize-none p-2 focus:outline-none custom-scrollbar"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={(!inputValue.trim() && !attachedFileText) || isLoading || isUploading}
            className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white transition-colors shrink-0 mb-0.5 mr-0.5 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" /> AI can make mistakes. Verify important actions.
          </p>
        </div>
      </div>
    </div>
  </div>
);
};

export default AdminCopilot;
