import React from 'react'
import { ChevronRight } from 'lucide-react'
import Card from '../Card'

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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div
        className="bg-slate-900 border border-emerald-500/30 rounded-xl p-5 relative overflow-hidden cursor-pointer shadow-md hover:shadow-emerald-500/5 transition-all duration-300"
        onClick={onOpenLiveResults}
      >
        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
          <span className="text-[0.65rem] text-emerald-400 font-bold uppercase">Live</span>
        </div>
        <div className="text-[0.72rem] text-slate-400 uppercase tracking-wide font-semibold">Ongoing Interviews</div>
        <div className="text-4xl font-extrabold text-white mt-1.5">{ongoingMonitoredCount}</div>

        <div className="mt-3 grid grid-cols-2 gap-1 text-[0.7rem] text-slate-500">
          <div><span className="text-emerald-400 font-semibold">{ongoingLiveCount}</span> live</div>
          <div><span className="text-rose-500 font-semibold">{ongoingAlertCount}</span> alerts</div>
          <div><span>0</span>/100 avg conf</div>
          <div><span>{ongoingSpeakingCount}</span> speaking</div>
          <div><span>{ongoingCodingCount}</span> coding</div>
          <div><span>{ongoingMonitoredCount}</span> monitored</div>
        </div>

        <button
          type="button"
          className="w-full py-1.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg text-xs font-semibold cursor-pointer mt-3.5 flex items-center justify-center gap-1 hover:bg-emerald-500/20 transition-all"
          onClick={(e) => { e.stopPropagation(); onOpenLiveResults(); }}
        >
          Live Results <ChevronRight size={14} />
        </button>
      </div>

      <Card
        className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 relative overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300 text-slate-800"
        onClick={() => onStatusFilter('all')}
      >
        <div className="absolute top-0 right-0 w-16 h-16 bg-primary/5 rounded-bl-full" />
        <div>
          <div className="text-[0.72rem] text-slate-500 uppercase tracking-wide font-semibold">Total Interviews</div>
          <div className="text-3xl font-extrabold text-primary mt-2">{dbStats.total}</div>
        </div>
        <div className="text-[0.72rem] text-slate-500 mt-2">
          <strong>{dbStats.today}</strong> today
        </div>
      </Card>

      <Card
        className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 relative overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300 text-slate-800"
        onClick={() => onStatusFilter('pending')}
      >
        <div className="absolute top-0 right-0 w-16 h-16 bg-warning/5 rounded-bl-full" />
        <div>
          <div className="text-[0.72rem] text-slate-500 uppercase tracking-wide font-semibold">Pending</div>
          <div className="text-3xl font-extrabold text-warning mt-2">{dbStats.pending}</div>
        </div>
        <div className="text-[0.72rem] text-slate-500 mt-2">
          <strong>{dbStats.started}</strong> in progress
        </div>
      </Card>

      <Card
        className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 relative overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300 text-slate-800"
        onClick={() => onStatusFilter('completed')}
      >
        <div className="absolute top-0 right-0 w-16 h-16 bg-success/5 rounded-bl-full" />
        <div>
          <div className="text-[0.72rem] text-slate-500 uppercase tracking-wide font-semibold">Completed</div>
          <div className="text-3xl font-extrabold text-success mt-2">{dbStats.completed}</div>
        </div>
        <div className="text-[0.72rem] text-slate-500 mt-2">
          Avg: <strong className="text-slate-800">{dbStats.avg_score}</strong>/100
        </div>
      </Card>

      <Card
        className="bg-white/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 relative overflow-hidden cursor-pointer hover:shadow-md transition-all duration-300 text-slate-800"
        onClick={onOpenQualified}
      >
        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-bl-full" />
        <div>
          <div className="text-[0.72rem] text-slate-500 uppercase tracking-wide font-semibold">Selected</div>
          <div className="text-3xl font-extrabold text-emerald-500 mt-2">{dbStats.selected}</div>
        </div>
        <div className="text-[0.72rem] text-slate-500 mt-2">
          <strong>{dbStats.rejected}</strong> rejected
        </div>
      </Card>
    </div>
  )
}
