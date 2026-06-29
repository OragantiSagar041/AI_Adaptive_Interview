import { useState } from 'react';
import { Mail, DollarSign, Send, CheckCircle, XCircle, UserPlus, RefreshCw } from 'lucide-react';
import { adminCopilotExecute } from '../../../utils/api';

const CopilotActionCard = ({ actionRequired, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCopilotExecute({
        action: actionRequired.action,
        data: actionRequired
      });
      setResult(res.message || "Action completed successfully.");
      if (onComplete) onComplete(res);
    } catch (err) {
      setError(err || "Failed to execute action.");
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = () => {
    switch (actionRequired.action) {
      case 'send_feedback': return <Mail className="w-5 h-5 text-blue-500" />;
      case 'request_credits': return <RefreshCw className="w-5 h-5 text-orange-500" />;
      case 'buy_credits': return <DollarSign className="w-5 h-5 text-green-500" />;
      case 'transfer_credits': return <Send className="w-5 h-5 text-purple-500" />;
      case 'create_admin': return <UserPlus className="w-5 h-5 text-indigo-500" />;
      default: return <CheckCircle className="w-5 h-5 text-gray-500" />;
    }
  };

  const renderTitle = () => {
    switch (actionRequired.action) {
      case 'send_feedback': return "Drafted Email";
      case 'request_credits': return "Credit Request";
      case 'buy_credits': return "Purchase Credits";
      case 'transfer_credits': return "Transfer Credits";
      case 'create_admin': return "Create Sub-Admin";
      default: return "Pending Action";
    }
  };

  return (
    <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm text-sm">
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-50">
        {renderIcon()}
        <span className="font-semibold text-slate-700">{renderTitle()}</span>
      </div>
      
      <div className="p-3 text-slate-600">
        {actionRequired.action === 'send_feedback' && (
          <div className="space-y-2 text-xs">
            <p><span className="text-slate-500 font-medium">To:</span> {actionRequired.candidate_email}</p>
            <div className="p-2 bg-slate-50 rounded border border-slate-200 whitespace-pre-wrap max-h-40 overflow-y-auto text-slate-700">
              {actionRequired.content}
            </div>
          </div>
        )}

        {(actionRequired.action === 'request_credits' || actionRequired.action === 'buy_credits' || actionRequired.action === 'transfer_credits') && (
          <div className="space-y-1">
            {actionRequired.admin_username && <p><span className="text-slate-500 font-medium">Target:</span> {actionRequired.admin_username}</p>}
            <p><span className="text-slate-500 font-medium">Amount:</span> <span className="font-bold text-green-600">{actionRequired.amount} Credits</span></p>
            {actionRequired.reason && <p><span className="text-slate-500 font-medium">Reason:</span> {actionRequired.reason}</p>}
          </div>
        )}

        {actionRequired.action === 'create_admin' && (
          <div className="space-y-1">
            <p><span className="text-slate-500 font-medium">Username:</span> {actionRequired.username}</p>
            <p><span className="text-slate-500 font-medium">Email:</span> {actionRequired.email}</p>
          </div>
        )}
      </div>

      <div className="p-3 pt-0 flex flex-col gap-2">
        {error && (
          <div className="text-red-700 text-xs flex items-center gap-1.5 bg-red-50 p-2 rounded border border-red-100">
            <XCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
        
        {result ? (
          <div className="text-green-700 text-xs flex items-center gap-1.5 bg-green-50 p-2 rounded border border-green-100">
            <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
            <span>{result}</span>
          </div>
        ) : (
          <button
            onClick={handleExecute}
            disabled={loading}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm"
          >
            {loading ? "Executing..." : "Confirm & Execute"}
          </button>
        )}
      </div>
    </div>
  );
};

export default CopilotActionCard;
