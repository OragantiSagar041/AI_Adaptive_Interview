import { useState } from 'react';
import { Mail, DollarSign, Send, CheckCircle, XCircle, UserPlus, RefreshCw, FileText, ExternalLink, Briefcase, Settings } from 'lucide-react';
import { adminCopilotExecute } from '../../../utils/api';

const CopilotActionCard = ({ actionRequired, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [linkUrl, setLinkUrl] = useState(null);

  const platformName = actionRequired.platform_name || actionRequired.app_name || actionRequired.platform || actionRequired.name || actionRequired.title || 'App';

  const handleExecute = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminCopilotExecute({
        action: actionRequired.action,
        data: actionRequired
      });
      setResult(res.message || "Action completed successfully.");
      if (res.link_url) setLinkUrl(res.link_url);
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
      case 'create_interview': return <FileText className="w-5 h-5 text-emerald-500" />;
      case 'create_job': return <Briefcase className="w-5 h-5 text-purple-600" />;
      case 'integrate_platform':
      case 'connect_app': return <Settings className="w-5 h-5 text-slate-700 dark:text-slate-300" />;
      case 'disconnect_app': return <XCircle className="w-5 h-5 text-red-500" />;
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
      case 'create_interview': return "Create Interview Session";
      case 'create_job': return "Create New Job Listing";
      case 'integrate_platform': return `Integrate ${platformName}`;
      case 'connect_app': return `Connect ${platformName}`;
      case 'disconnect_app': return `Disconnect ${platformName}`;
      default: return "Pending Action";
    }
  };

  return (
    <div className="mt-2 border border-slate-200 dark:border-[#26334d] rounded-lg overflow-hidden bg-white dark:bg-[#131b2e] shadow-sm text-sm">
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-[#26334d] bg-slate-50 dark:bg-[#0b1120]">
        {renderIcon()}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{renderTitle()}</span>
      </div>
      
      <div className="p-3 text-slate-600 dark:text-slate-300">
        {actionRequired.action === 'send_feedback' && (
          <div className="space-y-2 text-xs">
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">To:</span> {actionRequired.candidate_email}</p>
            <div className="p-2 bg-slate-50 dark:bg-[#0b1120] rounded border border-slate-200 dark:border-[#26334d] whitespace-pre-wrap max-h-40 overflow-y-auto text-slate-700 dark:text-slate-200">
              {actionRequired.content}
            </div>
          </div>
        )}

        {(actionRequired.action === 'request_credits' || actionRequired.action === 'buy_credits' || actionRequired.action === 'transfer_credits') && (
          <div className="space-y-1">
            {actionRequired.admin_username && <p><span className="text-slate-500 dark:text-slate-400 font-medium">Target:</span> {actionRequired.admin_username}</p>}
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Amount:</span> <span className="font-bold text-green-600 dark:text-green-400">{actionRequired.amount} Credits</span></p>
            {actionRequired.reason && <p><span className="text-slate-500 dark:text-slate-400 font-medium">Reason:</span> {actionRequired.reason}</p>}
          </div>
        )}

        {actionRequired.action === 'create_admin' && (
          <div className="space-y-1">
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Username:</span> {actionRequired.username}</p>
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Email:</span> {actionRequired.email}</p>
          </div>
        )}

        {actionRequired.action === 'create_interview' && (
          <div className="space-y-1">
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Candidate:</span> {actionRequired.candidate_name}</p>
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Email:</span> {actionRequired.candidate_email}</p>
            {actionRequired.experience && <p><span className="text-slate-500 dark:text-slate-400 font-medium">Experience:</span> {actionRequired.experience}</p>}
            {actionRequired.job_description && <p><span className="text-slate-500 dark:text-slate-400 font-medium">Job Context:</span> Provided</p>}
            {actionRequired.resume_text && <p><span className="text-slate-500 dark:text-slate-400 font-medium">Resume:</span> Parsed & Attached</p>}
          </div>
        )}

        {actionRequired.action === 'create_job' && (
          <div className="space-y-1">
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Title:</span> {actionRequired.title}</p>
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Experience:</span> {actionRequired.experience}</p>
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Skills:</span> {actionRequired.skills}</p>
            <p><span className="text-slate-500 dark:text-slate-400 font-medium">Description:</span> {actionRequired.description?.substring(0, 80)}{actionRequired.description?.length > 80 ? '...' : ''}</p>
          </div>
        )}

        {(actionRequired.action === 'integrate_platform' || actionRequired.action === 'connect_app') && (
          <div className="space-y-2 text-xs">
            <p className="font-medium text-slate-700 dark:text-slate-200">Platform Integration:</p>
            <div className="p-2 bg-slate-50 dark:bg-[#0b1120] rounded border border-slate-200 dark:border-[#26334d] whitespace-pre-wrap max-h-40 overflow-y-auto text-slate-600 dark:text-slate-300">
              {actionRequired.process_steps || `Ready to connect with ${platformName}. Click below to initiate automated connection and generate access tokens.`}
            </div>
          </div>
        )}

        {actionRequired.action === 'disconnect_app' && (
          <div className="space-y-2 text-xs">
            <p className="font-medium text-red-600 dark:text-red-400">Revoke Integration Access:</p>
            <p className="text-slate-600 dark:text-slate-300">Are you sure you want to disconnect <span className="font-semibold text-slate-800 dark:text-slate-100">{platformName}</span>? This will immediately revoke all active API keys and webhooks for this integration.</p>
          </div>
        )}
      </div>

      <div className="p-3 pt-0 flex flex-col gap-2">
        {error && (
          <div className="text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5 bg-red-50 dark:bg-red-950/40 p-2 rounded border border-red-100 dark:border-red-900">
            <XCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
          </div>
        )}
        
        {result ? (
          <div className="flex flex-col gap-2">
            <div className="text-green-700 dark:text-green-300 text-xs flex items-center gap-1.5 bg-green-50 dark:bg-green-950/40 p-2 rounded border border-green-100 dark:border-green-900 whitespace-pre-wrap">
              <CheckCircle className="w-4 h-4 shrink-0 text-green-500" />
              <span>{result}</span>
            </div>
            {linkUrl && (
              <a 
                href={linkUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex justify-center items-center gap-1 w-full py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md text-xs font-semibold transition-colors shadow-xs"
              >
                Open Interview Link <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : (
          <button
            onClick={handleExecute}
            disabled={loading}
            className={`w-full py-2 text-white rounded-md text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 shadow-xs cursor-pointer border-none ${
              actionRequired.action === 'disconnect_app' ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? "Executing..." : actionRequired.action === 'disconnect_app' ? `Disconnect ${platformName}` : actionRequired.action === 'connect_app' || actionRequired.action === 'integrate_platform' ? `Connect ${platformName}` : "Confirm & Execute"}
          </button>
        )}
      </div>
    </div>
  );
};

export default CopilotActionCard;
