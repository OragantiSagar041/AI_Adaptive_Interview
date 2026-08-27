import React from 'react'
import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  LogOut,
  Shield,
  Radio,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  MessageSquare,
  Briefcase,
} from 'lucide-react'
import logoImage from '../assets/logo.png'

export default function Sidebar({
  activeTab,
  onTabChange,
  onLogout,
  isCollapsed,
  setIsCollapsed,
}) {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle, path: '/admin/qualified-candidates' },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle, path: '/admin/rejected-candidates' },
    { id: 'create', label: 'Create Interview', icon: Plus, path: '/admin/create-interview' },
    { id: 'ai-calling', label: 'AI Calling Agent', icon: Radio, path: '/admin/ai-calling' },

    { id: 'jobs', label: 'Jobs', icon: Briefcase, path: '/admin/jobs' },
    { id: 'settings', label: 'Profile Settings', icon: Settings, path: '/admin/profile-settings' },
  ]

  return (
    <aside
      className={`bg-white dark:bg-[#0b1120] border-r border-slate-200/80 dark:border-slate-800 text-slate-800 dark:text-slate-100 flex flex-col z-50 shrink-0 overflow-hidden transition-all duration-300 sticky top-0 h-screen ${isCollapsed ? 'w-[80px] p-4 items-center gap-4' : 'w-[260px] p-5 gap-5'
        }`}
    >
      <div className={`flex w-full ${isCollapsed ? 'flex-col items-center gap-4' : 'items-center justify-between gap-2.5'}`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <img src={logoImage} alt="Hire IQ Logo" className="w-8 h-8 object-contain" />

          {!isCollapsed && (
            <strong className="text-xl font-bold tracking-tight text-slate-900 dark:text-white font-title truncate">Hire IQ</strong>
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
        {navItems.map(({ id, label, icon: Icon, path }) => {
          return (
            <NavLink
              key={id}
              to={path}
              title={isCollapsed ? label : ""}
              className={({ isActive }) =>
                `w-full text-left flex items-center rounded-lg font-medium text-sm transition-all border-none outline-none cursor-pointer no-underline ${isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3'
                } ${isActive && activeTab !== 'live'
                  ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {!isCollapsed && <span>{label}</span>}
            </NavLink>
          )
        })}

        <div className="border-t border-slate-200 dark:border-slate-800 my-2 w-full" />
        <button
          onClick={() => onTabChange('live')}
          title={isCollapsed ? "Live Results" : ""}
          className={`text-left flex items-center rounded-lg font-medium text-sm transition-all border-none outline-none cursor-pointer ${isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3 w-full'
            } ${activeTab === 'live'
              ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20'
              : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
        >
          <Radio size={16} className="shrink-0" />
          {!isCollapsed && <span>Live Results</span>}
        </button>
      </nav>

      <button
        onClick={onLogout}
        title={isCollapsed ? "Logout" : ""}
        className={`text-left flex items-center border border-slate-200 dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 outline-none cursor-pointer transition-all ${isCollapsed ? 'justify-center p-2 rounded-xl' : 'px-3.5 py-2 rounded-lg gap-3 w-full'
          }`}
      >
        <LogOut size={16} className="shrink-0" />
        {!isCollapsed && <span>Logout</span>}
      </button>
    </aside>
  )
}
