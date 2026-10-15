import { useState, useEffect } from 'react';
import { Mail, DollarSign, Send, CheckCircle, XCircle, UserPlus, RefreshCw, FileText, ExternalLink, Briefcase, Settings } from 'lucide-react';
import { adminCopilotExecute } from '../../../utils/api';

const CopilotActionCard = ({ actionRequired, onComplete, sessionId }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(
    actionRequired?.result || 
    (actionRequired?.status === 'completed' || actionRequired?.status === 'success' 
      ? (actionRequired?.message || 'completed') 
      : null)
  );
  const [error, setError] = useState(
    actionRequired?.error || 
    (actionRequired?.status === 'failed' || actionRequired?.status === 'error' 
      ? (actionRequired?.message || 'failed') 
      : null)
  );
  const [linkUrl, setLinkUrl] = useState(actionRequired?.link_url || null);
  const [candidateName, setCandidateName] = useState(actionRequired?.candidate_name || '');
  const [candidateEmail, setCandidateEmail] = useState(actionRequired?.candidate_email || '');
  const [adminUsername, setAdminUsername] = useState(actionRequired?.username || '');
  const [adminEmail, setAdminEmail] = useState(actionRequired?.email || '');

  useEffect(() => {
    if (actionRequired?.status === 'completed' || actionRequired?.status === 'success') {
      setResult(actionRequired.result || actionRequired.message || 'completed');
      setError(null);
    } else if (actionRequired?.status === 'failed' || actionRequired?.status === 'error') {
      setError(actionRequired.error || actionRequired.message || 'failed');
      setResult(null);
    }
    if (actionRequired?.link_url) {
      setLinkUrl(actionRequired.link_url);
    }
    if (actionRequired?.candidate_name && !candidateName) {
      setCandidateName(actionRequired.candidate_name);
    }
    if (actionRequired?.candidate_email && !candidateEmail) {
      setCandidateEmail(actionRequired.candidate_email);
    }
    if (actionRequired?.username && !adminUsername) {
      setAdminUsername(actionRequired.username);
    }
    if (actionRequired?.email && !adminEmail) {
      setAdminEmail(actionRequired.email);
    }
  }, [actionRequired?.status, actionRequired?.result, actionRequired?.error, actionRequired?.link_url, actionRequired?.candidate_name, actionRequired?.candidate_email, actionRequired?.username, actionRequired?.email]);

  const platformName = actionRequired.platform_name || actionRequired.app_name || actionRequired.platform || actionRequired.name || actionRequired.title || 'App';

  const getResolvedLinkUrl = (url) => {
    if (!url) return '#';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('/')) return trimmed;
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.includes('/interview')) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      if (parsed.searchParams.has('session_id') || parsed.searchParams.has('session')) {
        const sid = parsed.searchParams.get('session_id') || parsed.searchParams.get('session');
        return `/interview?session_id=${sid}`;
      }
      return trimmed;
    } catch {
      const match = trimmed.match(/\/interview\?[^'"\s]+/);
      if (match) return match[0];
      return trimmed;
    }
  };

  const handleCandidateNameChange = (e) => {
    setCandidateName(e.target.value);
    if (error) setError(null);
  };

  const handleCandidateEmailChange = (e) => {
    setCandidateEmail(e.target.value);
    if (error) setError(null);
  };

  const handleAdminUsernameChange = (e) => {
    setAdminUsername(e.target.value);
    if (error) setError(null);
  };

  const handleAdminEmailChange = (e) => {
    setAdminEmail(e.target.value);
    if (error) setError(null);
  };

  const handleExecute = async () => {
    if (actionRequired.action === 'create_interview') {
      const trimmedName = candidateName.trim();
      const trimmedEmail = candidateEmail.trim();

      if (!trimmedName || !trimmedEmail) {
        setError("Missing candidate name or email");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setError("Please enter a valid email address");
        return;
      }
    } else if (actionRequired.action === 'create_admin') {
      const trimmedUsername = adminUsername.trim();
      const trimmedEmail = adminEmail.trim();

      if (!trimmedUsername || !trimmedEmail) {
        setError("Missing username or email");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setError("Please enter a valid email address");
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      const payloadData = {
        ...actionRequired,
        ...(actionRequired.action === 'create_interview' ? {
          candidate_name: candidateName.trim(),
          candidate_email: candidateEmail.trim()
        } : {}),
        ...(actionRequired.action === 'create_admin' ? {
          username: adminUsername.trim(),
          email: adminEmail.trim()
        } : {}),
        session_id: sessionId
      };

      const res = await adminCopilotExecute({
        action: actionRequired.action,
        data: payloadData,
        session_id: sessionId
      });
      const successMsg = res.message || "Action completed successfully.";
      setResult(successMsg);
      if (res.link_url) setLinkUrl(res.link_url);
      if (onComplete) onComplete(res, null, payloadData);
    } catch (err) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || err?.detail || "Failed to execute action.");
      setError(errorMsg);
      if (onComplete) onComplete(null, errorMsg);
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
          <div className="space-y-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={adminUsername}
                onChange={handleAdminUsernameChange}
                disabled={loading || !!result}
                placeholder="Enter username"
                className={`w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#0b1120] border rounded-md text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-75 disabled:cursor-not-allowed ${
                  error && !adminUsername.trim() ? 'border-red-500 focus:border-red-500' : 'border-slate-200 dark:border-[#26334d] focus:border-indigo-500'
                }`}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={handleAdminEmailChange}
                disabled={loading || !!result}
                placeholder="admin@example.com"
                className={`w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#0b1120] border rounded-md text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-75 disabled:cursor-not-allowed ${
                  error && !adminEmail.trim() ? 'border-red-500 focus:border-red-500' : 'border-slate-200 dark:border-[#26334d] focus:border-indigo-500'
                }`}
              />
            </div>
          </div>
        )}

        {actionRequired.action === 'create_interview' && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Candidate Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={candidateName}
                onChange={handleCandidateNameChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecute();
                  }
                }}
                disabled={loading || !!result}
                placeholder="Enter candidate name (e.g. John Doe)"
                className={`w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#0b1120] border rounded-md text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-75 disabled:cursor-not-allowed ${
                  error && !candidateName.trim() ? 'border-red-500 focus:border-red-500' : 'border-slate-200 dark:border-[#26334d] focus:border-indigo-500'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Candidate Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={candidateEmail}
                onChange={handleCandidateEmailChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleExecute();
                  }
                }}
                disabled={loading || !!result}
                placeholder="Enter candidate email (e.g. candidate@example.com)"
                className={`w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-[#0b1120] border rounded-md text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-75 disabled:cursor-not-allowed ${
                  error && !candidateEmail.trim() ? 'border-red-500 focus:border-red-500' : 'border-slate-200 dark:border-[#26334d] focus:border-indigo-500'
                }`}
              />
            </div>

            {(actionRequired.experience || actionRequired.job_description || actionRequired.resume_text) && (
              <div className="pt-1 flex flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                {actionRequired.experience && (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#0b1120] rounded border border-slate-200 dark:border-[#26334d]">
                    Exp: {actionRequired.experience}
                  </span>
                )}
                {actionRequired.job_description && (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#0b1120] rounded border border-slate-200 dark:border-[#26334d]">
                    Job Context: Attached
                  </span>
                )}
                {actionRequired.resume_text && (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-[#0b1120] rounded border border-slate-200 dark:border-[#26334d]">
                    Resume: Attached
                  </span>
                )}
              </div>
            )}
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
        {result ? (
          <div className="flex flex-col gap-2">
            <div className="w-full py-2.5 px-3 bg-green-600 dark:bg-green-600 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs">
              <CheckCircle className="w-4 h-4 shrink-0 text-white" />
              <span>
                {actionRequired.action === 'transfer_credits' 
                  ? "sucessfully transfered credits" 
                  : (result || "Action completed successfully.")}
              </span>
            </div>
            {linkUrl && (
              <a 
                href={getResolvedLinkUrl(linkUrl)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex justify-center items-center gap-1 w-full py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-md text-xs font-semibold transition-colors shadow-xs"
              >
                Open Interview Link <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        ) : error ? (
          <div className="flex flex-col gap-1.5 w-full">
            <button
              onClick={handleExecute}
              disabled={loading}
              className="w-full py-2.5 px-3 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer border-none transition-colors"
              title="Click to retry"
            >
              <XCircle className="w-4 h-4 shrink-0 text-white" />
              <span>
                {loading 
                  ? "Executing..." 
                  : (actionRequired.action === 'transfer_credits' 
                      ? "transfering of credits has been failed" 
                      : (typeof error === 'string' ? error : "Action failed to execute."))}
              </span>
            </button>
            {error && typeof error === 'string' && actionRequired.action === 'transfer_credits' && error !== "transfering of credits has been failed" && (
              <p className="text-[11px] text-red-600 dark:text-red-400 text-center px-1 font-medium">
                {error}
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={handleExecute}
            disabled={loading}
            className={`w-full py-2.5 px-3 text-white rounded-md text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 shadow-xs cursor-pointer border-none ${
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
