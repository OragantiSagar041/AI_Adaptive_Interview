import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Maximize2, Minimize2, Loader2, Sparkles } from 'lucide-react';
import { adminCopilotChat } from '../../../utils/api';
import CopilotActionCard from './CopilotActionCard';
import { useSelector } from 'react-redux';

const AdminCopilot = () => {
  const user = useSelector(state => state.auth.adminUser);
  const authRole = useSelector(state => state.auth.role);
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello ${user?.name || 'Admin'}! I'm the Hire IQ Copilot. How can I help you today?`
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const role = authRole || 'admin';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (overrideText = null) => {
    const textToSend = typeof overrideText === 'string' ? overrideText : inputValue;
    if (!textToSend.trim()) return;

    const userMessage = { role: 'user', content: textToSend.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
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

    // Offline Interceptor: Request Credits
    const requestMatch = lowerText.match(/request.*?(\d+)/);
    if (requestMatch || lowerText.includes("request credit")) {
      const amount = requestMatch ? parseInt(requestMatch[1], 10) : 100;
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `I can help you request credits. Please review the details below:`,
          actionRequired: {
            action: "request_credits",
            amount: amount,
            admin_username: "super_admin",
            reason: "Need more credits"
          }
        }]);
        setIsLoading(false);
      }, 600);
      return;
    }

    // Offline Interceptor: Transfer Credits
    const transferMatch = lowerText.match(/transfer.*?(\d+)/);
    if (transferMatch || lowerText.includes("transfer credit")) {
      const amount = transferMatch ? parseInt(transferMatch[1], 10) : 50;
      setTimeout(() => {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `I can help you transfer credits. Please review the details below:`,
          actionRequired: {
            action: "transfer_credits",
            amount: amount,
            admin_username: "sub_admin",
            reason: "Allocation"
          }
        }]);
        setIsLoading(false);
      }, 600);
      return;
    }

    try {
      // Exclude action blocks from history sent to API to save tokens, only send text
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      
      const response = await adminCopilotChat({
        message: userMessage.content,
        history: history
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response.reply,
        actionRequired: response.action_required
      }]);
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
    <div className={`fixed bottom-6 right-6 flex flex-col bg-white border border-slate-200/60 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden z-50 transition-all duration-300 ease-in-out ${isExpanded ? 'w-[450px] h-[700px]' : 'w-[350px] h-[550px]'}`}>
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-4 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800 leading-tight">Hire IQ Copilot</h3>
            <p className="text-xs text-slate-500 capitalize">{role} Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1 relative z-10 text-slate-400">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors">
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 hover:bg-slate-100 hover:text-slate-600 rounded-md transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 custom-scrollbar">
        {messages.map((msg, index) => (
          <div key={index} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-1 shadow-sm">
                <Bot className="w-4 h-4 text-indigo-500" />
              </div>
            )}
            
            <div className={`max-w-[80%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
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
      <div className="p-3 bg-white border-t border-slate-100 shrink-0">
        <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/50 transition-all shadow-inner">
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
            disabled={!inputValue.trim() || isLoading}
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
  );
};

export default AdminCopilot;
