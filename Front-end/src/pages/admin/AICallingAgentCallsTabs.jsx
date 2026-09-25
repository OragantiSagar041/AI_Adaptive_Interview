import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Activity, CheckCircle2, XCircle, AlertCircle, Phone,
  RefreshCw, Copy, ArrowUpRight, ArrowDownLeft, Search, Filter,
  CheckCircle, Info, Eye, X
} from 'lucide-react'
import { parseDateStringToUtc } from '../../utils/adminFormatters'
import { SectionLoader, EmptyState } from './AICallingAgentConfigTabs'

function StatusBadge({ status }) {
  if (!status) return <span className="text-slate-400 text-xs">—</span>
  const s = status.toLowerCase()
  const map = {
    completed: { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', icon: <CheckCircle2 size={11} /> },
    failed: { bg: 'bg-rose-50 border-rose-200 text-rose-700', icon: <XCircle size={11} /> },
    'no-answer': { bg: 'bg-amber-50 border-amber-200 text-amber-700', icon: <AlertCircle size={11} /> },
    busy: { bg: 'bg-orange-50 border-orange-200 text-orange-700', icon: <AlertCircle size={11} /> },
  }
  const style = map[s] || { bg: 'bg-indigo-50 border-indigo-200 text-indigo-700', icon: <Activity size={11} /> }
  return (
    <span className={`inline-flex items-center gap-1 text-[0.68rem] font-bold border px-2 py-0.5 rounded-full ${style.bg}`}>
      {style.icon} {status.toUpperCase().replace('-', ' ')}
    </span>
  )
}


function ScoreBar({ label, value, max = 10, color = 'indigo' }) {
  const pct = value != null ? Math.min(100, (parseFloat(value) / max) * 100) : 0
  const colorMap = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    sky: 'bg-sky-500',
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.6rem] text-slate-500 dark:text-slate-400 w-20 shrink-0 font-bold uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
        <div className={`h-full ${colorMap[color] || colorMap.indigo} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.65rem] text-slate-700 dark:text-slate-200 font-bold font-mono w-8 text-right">{value != null ? parseFloat(value).toFixed(1) : '—'}</span>
    </div>
  )
}


function getAICallLinkId(call) {
  const callId = call?.id || call?.call_id || (call?.call_request_id?.id) || ''
  if (!callId) return null

  if (String(callId).startsWith('ai_call_')) {
    return String(callId)
  }
  return `ai_call_omni_${callId}`
}

function formatDuration(str) {
  if (!str) return '00:00';
  if (str.includes(':')) {
    const parts = str.split(':');
    if (parts.length >= 3) {
      const m = parseInt(parts[1] || '0', 10).toString().padStart(2, '0');
      const s = parseInt(parts[2] || '0', 10).toString().padStart(2, '0');
      return `${m}:${s}`;
    } else if (parts.length === 2) {
      const m = parseInt(parts[0] || '0', 10).toString().padStart(2, '0');
      const s = parseInt(parts[1] || '0', 10).toString().padStart(2, '0');
      return `${m}:${s}`;
    }
  }
  return str;
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown Date';
  try {
    const date = parseDateStringToUtc(dateString)
    if (!date || Number.isNaN(date.getTime())) return dateString
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'long',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch (e) {
    return dateString
  }
};


function RecentCallsTab({ calls, loading, onViewDetails, onRefresh }) {
  const [yesNoFilter, setYesNoFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [durationFilter, setDurationFilter] = useState('all');

  const handleRefresh = () => {
    if (onRefresh) onRefresh();
  };

  if (loading) return <SectionLoader />
  if (!calls || calls.length === 0) {
    return (
      <div className="w-full">
        <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-3xl h-[400px] gap-5 text-slate-400 shadow-sm">
          <div className="p-4 bg-indigo-50 rounded-full border border-indigo-100 text-indigo-400">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="2" />
              <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48 0a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
            </svg>
          </div>
          <span className="text-sm font-bold text-slate-500 dark:text-slate-400 tracking-wide">Previous calls will appear here</span>
        </div>
      </div>
    )
  }

  const displayCalls = calls.filter(call => {
    const st = (call.call_status || call.status || '').toLowerCase();
    if (st === 'initiated') return false;

    // Status filter matching dropdown options
    if (statusFilter !== 'all') {
      if (statusFilter === 'answered' && !['completed', 'answered', 'ended', 'success'].includes(st)) return false;
      if (statusFilter === 'missed' && !['no-answer', 'missed', 'unanswered', 'no_answer'].includes(st)) return false;
      if (statusFilter === 'voicemail' && !['voicemail', 'machine', 'answering_machine'].includes(st)) return false;
      if (statusFilter === 'busy' && !['busy', 'user_busy'].includes(st)) return false;
      if (statusFilter === 'failed' && !['failed', 'error', 'rejected'].includes(st)) return false;
    }

    // Direction filter
    const dirStr = (call.call_direction || call.call_type || call.direction || 'outbound').toLowerCase();
    if (directionFilter === 'inbound' && !dirStr.includes('inbound')) return false;
    if (directionFilter === 'outbound' && (!dirStr.includes('outbound') && !dirStr.includes('outgoing'))) return false;

    // Duration filter
    if (durationFilter !== 'all') {
      const durSec = typeof call.call_duration === 'number' 
        ? call.call_duration 
        : parseInt(call.call_duration || '0', 10);
      if (durationFilter === '>5' && durSec <= 300) return false;
      if (durationFilter === '<5' && durSec > 300) return false;
    }

    // yesNoFilter: 'all' | 'yes' | 'no'
    if (yesNoFilter === 'all') return true;

    // Determine if a call has any recording/transcript/post-call artifacts
    const hasRecording = !!(
      call.recording_url || call.recordings || call.has_recording || call.recording
    );
    const hasTranscript = !!(
      call.transcript || call.transcriptions || call.has_transcript || call.stt_transcript
    );
    const hasPostCall = hasRecording || hasTranscript || !!call.post_call

    if (yesNoFilter === 'yes') return hasPostCall;
    if (yesNoFilter === 'no') return !hasPostCall;

    return true;
  });

  return (
    <div className="w-full min-h-[500px]">
      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-6 bg-white dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex-wrap">
        <span className="text-slate-800 dark:text-slate-100 font-extrabold mr-2 ml-2">Recent Calls ({displayCalls.length})</span>
        <span className="text-slate-400 text-xs font-bold uppercase tracking-wider ml-auto mr-2">Filters <AlertCircle size={14} className="inline opacity-50" /></span>
        <select 
          value={directionFilter}
          onChange={e => setDirectionFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All directions</option>
          <option value="inbound">Incoming</option>
          <option value="outbound">Outgoing</option>
        </select>
        <select 
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All statuses</option>
          <option value="answered">Answered</option>
          <option value="missed">Missed</option>
          <option value="voicemail">Voicemail</option>
          <option value="busy">Busy</option>
          <option value="failed">Failed</option>
        </select>
        <select 
          value={durationFilter}
          onChange={e => setDurationFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All durations</option>
          <option value=">5">&gt; 5 min</option>
          <option value="<5">&lt; 5 min</option>
        </select>
        <select
          value={yesNoFilter}
          onChange={e => setYesNoFilter(e.target.value)}
          className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold rounded-lg px-3 py-1.5 outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">All</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        {(yesNoFilter !== 'all' || statusFilter !== 'all' || directionFilter !== 'all' || durationFilter !== 'all') && (
          <button type="button" onClick={() => {
            setYesNoFilter('all');
            setStatusFilter('all');
            setDirectionFilter('all');
            setDurationFilter('all');
          }} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-rose-500 hover:text-rose-600 hover:bg-rose-50 text-sm font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2 ml-auto sm:ml-0">
            <X size={14} /> Clear
          </button>
        )}
        <button type="button" onClick={handleRefresh} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-sm font-bold rounded-lg px-3 py-1.5 transition-colors flex items-center gap-2">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Cards List */}
      <div className="flex flex-col gap-3">
        {displayCalls.length === 0 ? (
          <EmptyState message="No completed or logged calls found." />
        ) : (
          displayCalls.map((call, idx) => {
            const st = (call.call_status || call.status || 'completed').toLowerCase();
            const isCompleted = st === 'completed' || st === 'answered' || st === 'ended';
            const dirStr = (call.call_direction || call.call_type || call.direction || 'outbound').toLowerCase();
            const isOutbound = dirStr.includes('outbound') || dirStr.includes('outgoing');
            
            let badgeColor = 'border-emerald-200 bg-emerald-50 text-emerald-600';
            let badgeLabel = call.call_status || 'Answered';
            if (st === 'missed' || st === 'no-answer') {
              badgeColor = 'border-amber-200 bg-amber-50 text-amber-600';
              badgeLabel = 'Missed';
            } else if (st === 'voicemail') {
              badgeColor = 'border-purple-200 bg-purple-50 text-purple-600';
              badgeLabel = 'Voicemail';
            } else if (st === 'busy') {
              badgeColor = 'border-orange-200 bg-orange-50 text-orange-600';
              badgeLabel = 'Busy';
            } else if (st === 'failed') {
              badgeColor = 'border-rose-200 bg-rose-50 text-rose-600';
              badgeLabel = 'Failed';
            } else if (isCompleted) {
              badgeColor = 'border-emerald-200 bg-emerald-50 text-emerald-600';
              badgeLabel = 'Answered';
            }

          return (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={call.id || idx}
              onClick={() => onViewDetails && onViewDetails(call.id)}
              className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group"
            >
              {/* Icon */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Phone size={16} className="text-indigo-500" />
              </div>

              {/* Info Column */}
              <div className="flex flex-col flex-1 gap-1">
                <div className="flex items-center gap-3">
                  <span className={`text-[0.6rem] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${isOutbound ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                    {isOutbound ? <ArrowUpRight size={10} strokeWidth={3} /> : <ArrowDownLeft size={10} strokeWidth={3} />}
                    {isOutbound ? 'Outgoing' : 'Incoming'}
                  </span>
                  <span className="text-slate-800 dark:text-slate-100 font-bold tracking-wide text-[15px] flex items-center gap-2">
                    {call.candidate_id && <span className="bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded text-[0.65rem] border border-slate-200 dark:border-slate-700">{call.candidate_id}</span>}
                    {call.candidate_name || call.user_name || call.name || call.from_number || '+Unknown'} <span className="text-slate-400 mx-1 font-normal">→</span> {call.to_number || '+Unknown'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-medium">
                  <span>{formatDate(call.time_of_call)}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono bg-slate-100 dark:bg-slate-800/50 px-1.5 rounded text-slate-600 dark:text-slate-400">{formatDuration(call.call_duration)}</span>
                </div>
              </div>

                {/* Right Column */}
                <div className="flex flex-col items-end gap-2 ml-auto">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded-md text-[0.7rem] text-slate-500 dark:text-slate-400 font-bold font-mono">
                    ID: #{call.id}
                    <Copy size={12} className="cursor-pointer hover:text-indigo-600 transition-colors" />
                  </div>
                </div>
              </motion.div>
            )
          }))}
      </div >
    </div >
  )
}


function ApprovalCallsTab({ calls, loading, onViewDetails, onDecision, actionLoadingMap }) {
  const [searchFilter, setSearchFilter] = useState('')
  const [filterTab, setFilterTab] = useState('pending') // 'pending', 'approved', 'rejected', 'all'

  const completedCalls = calls.filter(call => {
    const st = (call.call_status || call.status || '').toLowerCase()
    return ['completed', 'answered', 'ended', 'success'].includes(st)
  })

  const pendingCount = completedCalls.filter(c => !c.decision || c.decision === 'pending' || c.decision === 'none').length
  const approvedCount = completedCalls.filter(c => c.decision === 'selected' || c.decision === 'approved').length
  const rejectedCount = completedCalls.filter(c => c.decision === 'rejected').length

  const filteredCalls = completedCalls.filter(call => {
    const dec = (call.decision || 'pending').toLowerCase()
    if (filterTab === 'pending' && dec !== 'pending' && dec !== 'none' && dec !== '') return false
    if (filterTab === 'approved' && dec !== 'selected' && dec !== 'approved') return false
    if (filterTab === 'rejected' && dec !== 'rejected') return false

    const name = (call.candidate_name || call.user_name || call.name || call.to_number || '').toString().toLowerCase()
    const id = (call.id || call.call_id || '').toString().toLowerCase()
    return name.includes(searchFilter.toLowerCase()) || id.includes(searchFilter.toLowerCase())
  })

  return (
    <div className="w-full min-h-[500px]">
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3 bg-white dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div>
            <p className="text-slate-900 dark:text-white font-extrabold text-lg">Approval Queue</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Review completed AI calls and approve or reject candidates for the Hire IQ interview stage.</p>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search by candidate or call ID"
              className="min-w-[220px] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
            {searchFilter && (
              <button
                type="button"
                onClick={() => setSearchFilter('')}
                className="text-slate-500 dark:text-slate-400 hover:text-indigo-700 text-sm font-bold"
              >Clear</button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('pending')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'pending'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            Pending Approval ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('approved')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'approved'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('rejected')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'rejected'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            Rejected ({rejectedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
            }`}
          >
            All Calls ({completedCalls.length})
          </button>
        </div>
      </div>

      {loading ? (
        <SectionLoader />
      ) : filteredCalls.length === 0 ? (
        <EmptyState message={`No ${filterTab === 'all' ? 'completed' : filterTab} candidates found.`} />
      ) : (
        <div className="grid gap-4">
          {filteredCalls.map((call, idx) => {
            const status = (call.call_status || call.status || 'completed').toLowerCase()
            const isCompleted = ['completed', 'answered', 'ended', 'success'].includes(status)
            const linkId = getAICallLinkId(call)
            const loadingAction = !!actionLoadingMap[linkId]
            const currentDecision = (call.decision || '').toLowerCase()
            const isApproved = currentDecision === 'selected' || currentDecision === 'approved'
            const isRejected = currentDecision === 'rejected'

            return (
              <div key={call.id || idx} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-3xl p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400">Candidate</span>
                      <span className="px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[11px] font-semibold border border-indigo-100">{isCompleted ? 'Completed' : 'Pending'}</span>
                      {isApproved && (
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold border border-emerald-200">
                          ✓ APPROVED
                        </span>
                      )}
                      {isRejected && (
                        <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-extrabold border border-rose-200">
                          ✕ REJECTED
                        </span>
                      )}
                    </div>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{call.candidate_name || call.user_name || call.name || 'Unknown Candidate'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Call ID: {call.id || call.call_id || 'N/A'}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Status: {status.toUpperCase()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => onDecision(call, 'selected')}
                      disabled={!isCompleted || loadingAction}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        isApproved
                          ? 'bg-emerald-700 text-white ring-2 ring-emerald-400'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {loadingAction ? 'Saving...' : isApproved ? '✓ Approved' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecision(call, 'rejected')}
                      disabled={!isCompleted || loadingAction}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                        isRejected
                          ? 'bg-rose-700 text-white ring-2 ring-rose-400'
                          : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                      }`}
                    >
                      {loadingAction ? 'Saving...' : isRejected ? '✕ Rejected' : 'Reject'}
                    </button>
                  </div>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[0.65rem] uppercase tracking-widest text-slate-500 dark:text-slate-400">Call time</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{formatDate(call.time_of_call)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[0.65rem] uppercase tracking-widest text-slate-500 dark:text-slate-400">Duration</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{formatDuration(call.call_duration)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-3">
                    <p className="text-[0.65rem] uppercase tracking-widest text-slate-500 dark:text-slate-400">Call Rating</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">{call.cqs_score || call.metric_score_intent || 'N/A'}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}



export {
  StatusBadge,
  ScoreBar,
  getAICallLinkId,
  formatDuration,
  formatDate,
  RecentCallsTab,
  ApprovalCallsTab
}
