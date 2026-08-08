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

const ACCENT_THEMES = {
  indigo: {
    primary: '#6366f1',
    hover: '#4f46e5',
    bgLight: '#eef2ff',
    borderLight: '#e0e7ff',
    textLight: '#4338ca',
    glow: 'rgba(99, 102, 241, 0.35)',
  },
  teal: {
    primary: '#0d9488',
    hover: '#0f766e',
    bgLight: '#f0fdfa',
    borderLight: '#ccfbf1',
    textLight: '#0f766e',
    glow: 'rgba(13, 148, 136, 0.35)',
  },
  purple: {
    primary: '#9333ea',
    hover: '#7e22ce',
    bgLight: '#faf5ff',
    borderLight: '#f3e8ff',
    textLight: '#7e22ce',
    glow: 'rgba(147, 51, 234, 0.35)',
  },
  red: {
    primary: '#e11d48',
    hover: '#be123c',
    bgLight: '#fff1f2',
    borderLight: '#ffe4e6',
    textLight: '#be123c',
    glow: 'rgba(225, 29, 72, 0.35)',
  },
  green: {
    primary: '#16a34a',
    hover: '#15803d',
    bgLight: '#f0fdf4',
    borderLight: '#dcfce7',
    textLight: '#15803d',
    glow: 'rgba(22, 163, 74, 0.35)',
  },
  blue: {
    primary: '#2563eb',
    hover: '#1d4ed8',
    bgLight: '#eff6ff',
    borderLight: '#dbeafe',
    textLight: '#1d4ed8',
    glow: 'rgba(37, 99, 237, 0.35)',
  },
  emerald: {
    primary: '#10b981',
    hover: '#059669',
    bgLight: '#ecfdf5',
    borderLight: '#d1fae5',
    textLight: '#047857',
    glow: 'rgba(16, 185, 129, 0.35)',
  },
  amber: {
    primary: '#d97706',
    hover: '#b45309',
    bgLight: '#fffbeb',
    borderLight: '#fef3c7',
    textLight: '#b45309',
    glow: 'rgba(217, 119, 6, 0.35)',
  },
  rose: {
    primary: '#f43f5e',
    hover: '#e11d48',
    bgLight: '#fff1f2',
    borderLight: '#ffe4e6',
    textLight: '#e11d48',
    glow: 'rgba(244, 63, 94, 0.35)',
  },
  cyan: {
    primary: '#0891b2',
    hover: '#0e7490',
    bgLight: '#ecfeff',
    borderLight: '#cffafe',
    textLight: '#0e7490',
    glow: 'rgba(8, 145, 178, 0.35)',
  },
};

const AdminCopilot = () => {
  const user = useSelector(state => state.auth.adminUser);
  const authRole = useSelector(state => state.auth.role);
  
  const [accentColor, setAccentColor] = useState(() => {
    try {
      return localStorage.getItem('theme_accent') || 'indigo';
    } catch {
      return 'indigo';
    }
  });

  useEffect(() => {
    const updateAccent = (e) => {
      try {
        const color = (e && e.detail) || localStorage.getItem('theme_accent') || 'indigo';
        setAccentColor(color);
      } catch {}
    };

    window.addEventListener('storage', updateAccent);
    window.addEventListener('accent_changed', updateAccent);
    return () => {
      window.removeEventListener('storage', updateAccent);
      window.removeEventListener('accent_changed', updateAccent);
    };
  }, []);

  const currentTheme = ACCENT_THEMES[accentColor] || ACCENT_THEMES.indigo;
  
  const sessionUser = (() => {
    try {
      return JSON.parse(sessionStorage.getItem('adminUser') || '{}');
    } catch {
      return {};
    }
  })();

  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const isMaster = authRole === 'master' || sessionUser?.role === 'master' || sessionUser?.is_master || pathname.startsWith('/master');
  const isSuperAdmin = !isMaster && (authRole === 'super_admin' || authRole === 'tenant' || sessionUser?.role === 'tenant' || sessionUser?.role === 'super_admin' || pathname.startsWith('/superadmin'));
  const isRecruiter = !isMaster && !isSuperAdmin;

  const roleType = isMaster ? 'master' : (isSuperAdmin ? 'super_admin' : 'recruiter');

  const displayName = 
    user?.name || 
    sessionUser?.name || 
    user?.username || 
    sessionUser?.username || 
    sessionStorage.getItem('adminName') || 
    sessionStorage.getItem('adminUsername') || 
    (isMaster ? 'master' : (isSuperAdmin ? 'Super Admin' : 'Recruiter'));

  const copilotTitle = isMaster 
    ? 'Hire IQ Master Copilot' 
    : (isSuperAdmin ? 'Hire IQ Super Admin Copilot' : 'Hire IQ Recruiter Copilot');

  const copilotSubtitle = isMaster 
    ? 'Master Platform Assistant' 
    : (isSuperAdmin ? 'Super Admin Assistant' : 'Recruiter Assistant');

  const getGreeting = (name, type) => {
    if (type === 'master') {
      return `Hello ${name || 'master'}! I'm the Hire IQ Master Copilot. How can I help you manage the platform, plans, and tenants today?`;
    } else if (type === 'super_admin') {
      return `Hello ${name || 'Super Admin'}! I'm the Hire IQ Super Admin Copilot. How can I assist you with your company's team, interviews, and credits today?`;
    } else {
      return `Hello ${name || 'Recruiter'}! I'm the Hire IQ Recruiter Copilot. How can I help you with candidate evaluations and interviews today?`;
    }
  };

  const sanitizeSessionMessages = (msgs) => {
    if (!msgs || msgs.length === 0) {
      return [{ role: 'assistant', content: getGreeting(displayName, roleType) }];
    }
    return msgs.map((msg, idx) => {
      if (idx === 0 && msg.role === 'assistant') {
        const c = typeof msg.content === 'string' ? msg.content : '';
        if (
          c.includes("Hello Admin!") || 
          c.includes("I'm the Hire IQ Copilot") || 
          c.includes("How can I help you today?") ||
          c.startsWith("Hello ")
        ) {
          return {
            ...msg,
            content: getGreeting(displayName, roleType)
          };
        }
      }
      return msg;
    });
  };

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  
  const [sessions, setSessions] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: getGreeting(displayName, roleType)
    }
  ]);
  
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedFileText, setAttachedFileText] = useState(null);
  const [attachedFileName, setAttachedFileName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  useEffect(() => {
    setMessages(prev => sanitizeSessionMessages(prev));
  }, [displayName, roleType]);

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
        setMessages(sanitizeSessionMessages(detail.session.messages));
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
        setMessages(sanitizeSessionMessages(res.session.messages || []));
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
    if (isMaster) {
      return [
        "Show me total platform revenue",
        "How many total interviews are completed?",
        "How many active super admins?",
        "Show all subscription plans and pricing"
      ];
    }
    if (isSuperAdmin) {
      return [
        "Check company credit balance",
        "How many sub-admins do I have?",
        "Show recent completed interviews in our company",
        "Transfer 50 credits to a recruiter"
      ];
    }
    // Default recruiter
    return [
      "Show my recent candidate interviews",
      "Draft feedback email for top candidate",
      "How does ATS & AI scoring work?",
      "Request credits from super admin"
    ];
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: `linear-gradient(135deg, ${currentTheme.primary}, ${currentTheme.hover})`,
          boxShadow: `0 10px 25px -5px ${currentTheme.glow}`
        }}
        className="fixed bottom-6 right-6 p-4 rounded-full text-white hover:-translate-y-1 transition-all duration-300 z-50 group flex items-center justify-center cursor-pointer border-none"
      >
        <Sparkles className="w-6 h-6 animate-pulse" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-500 ease-in-out whitespace-nowrap pl-0 group-hover:pl-2 font-medium">
          {copilotTitle}
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed bottom-6 right-6 flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden z-50 transition-all duration-300 ease-in-out ${isExpanded ? 'w-[520px] h-[720px]' : 'w-[380px] h-[580px]'}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-3.5 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div 
          className="absolute top-0 right-0 w-32 h-32 blur-3xl rounded-full pointer-events-none" 
          style={{ background: currentTheme.glow }}
        />
        <div className="flex items-center gap-2.5 relative z-10">
          <button 
            onClick={() => setShowSidebar(!showSidebar)}
            title="Chat History Sessions"
            className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold cursor-pointer border-none bg-transparent"
          >
            <History className="w-4 h-4" style={{ color: currentTheme.primary }} />
          </button>

          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center shadow-md shrink-0"
            style={{
              background: `linear-gradient(135deg, ${currentTheme.primary}, ${currentTheme.hover})`,
              boxShadow: `0 4px 12px ${currentTheme.glow}`
            }}
          >
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 text-xs leading-tight">{copilotTitle}</h3>
            <p className="text-[10px] text-slate-500 capitalize">{copilotSubtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 relative z-10 text-slate-400">
          <button 
            onClick={handleNewChat} 
            title="New Chat Session" 
            className="p-1.5 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer border-none bg-transparent"
            style={{ color: currentTheme.primary }}
          >
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors cursor-pointer border-none bg-transparent">
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors cursor-pointer border-none bg-transparent">
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
                <button onClick={() => setShowSidebar(false)} className="p-1 hover:bg-slate-200 rounded-md cursor-pointer border-none bg-transparent">
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <span className="text-xs font-semibold text-slate-700">Chat History</span>
              </div>
              <button 
                onClick={handleNewChat}
                style={{ background: currentTheme.primary }}
                className="px-2.5 py-1 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shadow-sm hover:opacity-90 transition-opacity cursor-pointer border-none"
              >
                <Plus className="w-3 h-3" /> New Chat
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {loadingSessions ? (
                <div className="flex justify-center items-center py-8 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: currentTheme.primary }} />
                </div>
              ) : sessions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No saved chat sessions.</p>
              ) : (
                sessions.map(s => {
                  const isSelected = currentSessionId === s.session_id;
                  return (
                    <div
                      key={s.session_id}
                      onClick={() => selectSession(s.session_id)}
                      style={isSelected ? {
                        background: currentTheme.bgLight,
                        borderColor: currentTheme.borderLight,
                        color: currentTheme.textLight
                      } : {}}
                      className={`group p-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-between border ${
                        isSelected
                          ? 'font-semibold'
                          : 'border-transparent hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <MessageSquare 
                          className="w-3.5 h-3.5 shrink-0" 
                          style={{ color: isSelected ? currentTheme.primary : undefined }} 
                        />
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
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-600 rounded text-slate-400 transition-all cursor-pointer border-none bg-transparent"
                        title="Delete Session"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
          {messages.map((msg, index) => (
          <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-1 shadow-xs">
                <Bot className="w-4 h-4" style={{ color: currentTheme.primary }} />
              </div>
            )}
            
            <div className={`max-w-[88%] w-full flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div 
                className={`p-3 rounded-2xl text-sm ${
                  msg.role === 'user' 
                    ? 'rounded-tr-sm shadow-md' 
                    : 'bg-white text-slate-700 border border-slate-200/80 rounded-tl-sm shadow-xs'
                }`}
                style={msg.role === 'user' ? {
                  background: currentTheme.primary,
                  color: '#ffffff',
                  boxShadow: `0 4px 12px ${currentTheme.glow}`
                } : {}}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
              
              {/* Render Action Card if present */}
              {msg.actionRequired && (
                <div className="w-full mt-2">
                  <CopilotActionCard actionRequired={msg.actionRequired} currentTheme={currentTheme} />
                </div>
              )}
            </div>

            {msg.role === 'user' && (
              <div 
                className="w-8 h-8 rounded-full shadow-xs flex items-center justify-center shrink-0 mt-1"
                style={{ background: currentTheme.primary }}
              >
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs">
              <Bot className="w-4 h-4" style={{ color: currentTheme.primary }} />
            </div>
            <div className="bg-white border border-slate-200/80 p-3 rounded-2xl rounded-tl-sm shadow-xs flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentTheme.primary }} />
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
              className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-full text-[11px] text-slate-600 hover:text-slate-800 transition-colors shadow-xs text-left leading-tight max-w-full cursor-pointer"
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
          <div 
            className="flex items-center justify-between rounded-lg p-2 px-3 border"
            style={{
              background: currentTheme.bgLight,
              borderColor: currentTheme.borderLight,
              color: currentTheme.textLight
            }}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <Paperclip className="w-3.5 h-3.5 shrink-0" style={{ color: currentTheme.primary }} />
              <span className="text-[11px] font-medium truncate">{attachedFileName}</span>
            </div>
            <button 
              onClick={removeAttachment} 
              className="p-1 hover:opacity-80 rounded-md transition-colors cursor-pointer border-none bg-transparent"
              style={{ color: currentTheme.primary }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div 
          className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 transition-all shadow-inner"
          style={isInputFocused ? {
            borderColor: currentTheme.primary,
            boxShadow: `0 0 0 1px ${currentTheme.primary}`
          } : {}}
        >
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
            className={`p-2.5 rounded-lg shrink-0 mb-0.5 ml-0.5 transition-colors cursor-pointer border-none bg-transparent ${
              isUploading 
                ? 'text-slate-400' 
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
            }`}
            title="Attach Resume or Document"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: currentTheme.primary }} /> : <Paperclip className="w-4 h-4" />}
          </button>

          <textarea
            id="copilot-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Copilot..."
            className="flex-1 max-h-32 min-h-[40px] bg-transparent text-sm text-slate-800 placeholder:text-slate-400 resize-none p-2 focus:outline-none custom-scrollbar"
            rows={1}
          />
          <button
            onClick={() => handleSend()}
            disabled={(!inputValue.trim() && !attachedFileText) || isLoading || isUploading}
            style={(!inputValue.trim() && !attachedFileText) || isLoading || isUploading ? {} : {
              background: currentTheme.primary
            }}
            className="p-2.5 rounded-lg disabled:bg-slate-200 disabled:text-slate-400 text-white transition-colors shrink-0 mb-0.5 mr-0.5 shadow-sm cursor-pointer border-none hover:opacity-90"
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
