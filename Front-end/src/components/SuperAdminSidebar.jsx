import React from 'react'
import { useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  LogOut,
  Shield,
  Users,
  Radio,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Briefcase,
} from 'lucide-react'
import logoImage from '../assets/logo.png'

export default function SuperAdminSidebar({
  activeTab,
  onTabChange,
  onLogout,
  isCollapsed,
  setIsCollapsed,
}) {
  const location = useLocation()

  const superNavItems = [
    { id: 'super-dashboard', label: 'Super Admin Dashboard', icon: BarChart2 },
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'interviews', label: 'Interviews', icon: Users, path: '/superadmin/interviews' },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle },
    { id: 'create', label: 'Create Interview', icon: Plus, path: '/superadmin/create-interview' },
    { id: 'ai-calling', label: 'AI Calling Agent', icon: Radio, path: '/superadmin/ai-calling' },

    { id: 'jobs', label: 'Jobs', icon: Briefcase, path: '/superadmin/jobs' },
    { id: 'settings', label: 'Profile Settings', icon: Settings },
  ]

  // Derive active tab from URL query param matching the activeTab prop
  const handleTabClick = (id) => {
    onTabChange(id)
  }

  return (
    <aside
      className={`bg-sidebar border-r border-border text-foreground flex flex-col z-50 shrink-0 overflow-hidden transition-all duration-300 sticky top-0 h-screen ${isCollapsed ? 'w-[80px] p-4 items-center gap-4' : 'w-[260px] p-5 gap-5'
        }`}
    >
      <div className={`flex w-full ${isCollapsed ? 'flex-col items-center gap-4' : 'items-center justify-between gap-2.5'}`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white p-1 cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
            }}
          >
            <img src={logoImage} alt="Hire IQ Logo" className="w-full h-full object-contain" />
          </div>
          {!isCollapsed && (
            <strong className="text-base font-extrabold tracking-tight text-foreground font-title truncate">HireIQ</strong>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border-none cursor-pointer outline-none transition-colors shrink-0"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex flex-col gap-1.5 flex-grow overflow-y-auto w-full scrollbar-none">
        {!isCollapsed && (
          <div className="text-[0.62rem] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-1">
            Super Admin Control
          </div>
        )}
        {superNavItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id

          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              title={isCollapsed ? label : ""}
              className={`w-full text-left flex items-center rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3'
                } ${isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                  : 'bg-transparent text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`}
            >
              <Icon size={16} className="shrink-0" />
              {!isCollapsed && <span>{label}</span>}
            </button>
          )
        })}

        <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-full" />
        <button
          onClick={() => handleTabClick('live')}
          title={isCollapsed ? "Live Results" : ""}
          className={`text-left flex items-center rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3 w-full'
            } ${activeTab === 'live'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white !bg-transparent dark:!bg-transparent !border-none !shadow-none'
            }`}
        >
          <Radio size={16} className="shrink-0" />
          {!isCollapsed && <span>Live Results</span>}
        </button>
      </nav>

      <button
        onClick={onLogout}
        title={isCollapsed ? "Logout" : ""}
        className={`text-left flex items-center hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 outline-none cursor-pointer transition-all !bg-transparent dark:!bg-transparent !border-none !shadow-none ${isCollapsed ? 'justify-center p-2 rounded-xl' : 'px-3.5 py-2 rounded-lg gap-3 w-full'
          }`}
      >
        <LogOut size={16} className="shrink-0" />
        {!isCollapsed && <span>Logout</span>}
      </button>
    </aside>
  )
}
