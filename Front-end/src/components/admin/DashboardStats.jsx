import React from 'react'
import { ChevronRight, Activity, Users, Clock, CheckCircle, Award, ShieldAlert, Monitor, Mic } from 'lucide-react'

export default function DashboardStats({
  dbStats,
  ongoingLiveCount,
  ongoingAlertCount,
  ongoingSpeakingCount,
  ongoingCodingCount,
  ongoingMonitoredCount,
  onOpenLiveResults,
  onStatusFilter,
  onOpenQualified,
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
      {/* Live Monitoring Card - Premium Dark Glassmorphic */}
      <div
        className="sm:col-span-2 lg:col-span-1 bg-gradient-to-br from-slate-900 via-[#0f172a] to-[#1e1b4b] border border-indigo-500/20 rounded-2xl p-5 relative overflow-hidden cursor-pointer shadow-lg shadow-indigo-900/20 hover:shadow-indigo-500/20 hover:-translate-y-1 hover:border-indigo-500/40 transition-all duration-300 group"
        onClick={onOpenLiveResults}
      >
        {/* Animated Background Elements */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/20 blur-[30px] rounded-full group-hover:bg-indigo-500/30 transition-all duration-500" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-emerald-500/10 blur-[20px] rounded-full" />

        <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-ping absolute opacity-75" />
          <div className="w-2 h-2 bg-emerald-500 rounded-full relative" />
          <span className="text-[0.65rem] text-emerald-400 font-bold uppercase tracking-wider">Live</span>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-2 text-indigo-200/80 mb-2">
            <Activity size={14} className="text-indigo-400" />
            <span className="text-[0.7rem] uppercase tracking-widest font-semibold">Active Sessions</span>
          </div>
          <div className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-indigo-200 mt-1 mb-4">
            {ongoingMonitoredCount}
          </div>

          <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[0.7rem]">
            <div className="flex items-center gap-1.5 bg-slate-800/50 rounded-lg p-1.5 border border-slate-700/50">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
              <span className="text-slate-300"><strong className="text-emerald-400">{ongoingLiveCount}</strong> Live</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/50 rounded-lg p-1.5 border border-slate-700/50">
              <ShieldAlert size={10} className="text-rose-400" />
              <span className="text-slate-300"><strong className="text-rose-400">{ongoingAlertCount}</strong> Alerts</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/50 rounded-lg p-1.5 border border-slate-700/50">
              <Mic size={10} className="text-sky-400" />
              <span className="text-slate-300"><strong className="text-sky-400">{ongoingSpeakingCount}</strong> Speak</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/50 rounded-lg p-1.5 border border-slate-700/50">
              <Monitor size={10} className="text-purple-400" />
              <span className="text-slate-300"><strong className="text-purple-400">{ongoingCodingCount}</strong> Code</span>
            </div>
          </div>

          <button
            type="button"
            className="w-full py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-xl text-xs font-bold cursor-pointer mt-5 flex items-center justify-center gap-1 hover:bg-indigo-500/20 hover:text-white transition-all group-hover:border-indigo-400/40"
            onClick={(e) => { e.stopPropagation(); onOpenLiveResults(); }}
          >
            Monitor Live <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </div>
      </div>

      {/* Total Card */}
      <div
        className="bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl p-5 relative overflow-hidden cursor-pointer shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(59,130,246,0.15)] hover:-translate-y-1 hover:border-blue-200 transition-all duration-300 group"
        onClick={() => onStatusFilter('all')}
      >
        <Users className="absolute -bottom-4 -right-4 w-24 h-24 text-blue-50 opacity-50 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100/30 blur-[30px] rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-blue-50 text-blue-500 rounded-lg"><Users size={16} /></div>
            <span className="text-[0.7rem] text-slate-500 uppercase tracking-widest font-bold">Total Interviews</span>
          </div>
          <div className="text-3xl font-black text-slate-800 mt-3">{dbStats.total}</div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium"><strong className="text-blue-600">{dbStats.today}</strong> today</span>
            <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors"><ChevronRight size={14} /></div>
          </div>
        </div>
      </div>

      {/* Pending Card */}
      <div
        className="bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl p-5 relative overflow-hidden cursor-pointer shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(245,158,11,0.15)] hover:-translate-y-1 hover:border-amber-200 transition-all duration-300 group"
        onClick={() => onStatusFilter('pending')}
      >
        <Clock className="absolute -bottom-4 -right-4 w-24 h-24 text-amber-50 opacity-50 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-100/30 blur-[30px] rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-amber-50 text-amber-500 rounded-lg"><Clock size={16} /></div>
            <span className="text-[0.7rem] text-slate-500 uppercase tracking-widest font-bold">Pending</span>
          </div>
          <div className="text-3xl font-black text-slate-800 mt-3">{dbStats.pending}</div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium"><strong className="text-amber-600">{dbStats.started}</strong> in progress</span>
            <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-amber-50 group-hover:text-amber-500 transition-colors"><ChevronRight size={14} /></div>
          </div>
        </div>
      </div>

      {/* Completed Card */}
      <div
        className="bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl p-5 relative overflow-hidden cursor-pointer shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(16,185,129,0.15)] hover:-translate-y-1 hover:border-emerald-200 transition-all duration-300 group"
        onClick={() => onStatusFilter('completed')}
      >
        <CheckCircle className="absolute -bottom-4 -right-4 w-24 h-24 text-emerald-50 opacity-50 group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-100/30 blur-[30px] rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-500 rounded-lg"><CheckCircle size={16} /></div>
            <span className="text-[0.7rem] text-slate-500 uppercase tracking-widest font-bold">Completed</span>
          </div>
          <div className="text-3xl font-black text-slate-800 mt-3">{dbStats.completed}</div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Avg score: <strong className="text-emerald-600">{dbStats.avg_score}</strong></span>
            <div className="w-6 h-6 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-emerald-50 group-hover:text-emerald-500 transition-colors"><ChevronRight size={14} /></div>
          </div>
        </div>
      </div>

      {/* Qualified Card */}
      <div
        className="bg-gradient-to-br from-indigo-50 to-white backdrop-blur-xl border border-indigo-100 rounded-2xl p-5 relative overflow-hidden cursor-pointer shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_30px_-4px_rgba(99,102,241,0.2)] hover:-translate-y-1 hover:border-indigo-300 transition-all duration-300 group"
        onClick={onOpenQualified}
      >
        <Award className="absolute -bottom-4 -right-4 w-24 h-24 text-indigo-100 opacity-50 group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500" />
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-200/30 blur-[30px] rounded-full" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg"><Award size={16} /></div>
            <span className="text-[0.7rem] text-indigo-600 uppercase tracking-widest font-bold">Selected</span>
          </div>
          <div className="text-3xl font-black text-indigo-600 mt-3">{dbStats.selected}</div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium"><strong className="text-rose-500">{dbStats.rejected}</strong> rejected</span>
            <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors"><ChevronRight size={14} /></div>
          </div>
        </div>
      </div>

    </div>
  )
}
