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
} from 'lucide-react'

export default function Sidebar({
  activeTab,
  onTabChange,
  onLogout,
  currentAccent,
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
    { id: 'settings', label: 'Profile Settings', icon: Settings, path: '/admin/profile-settings' },
  ]

  return (
    <aside
      className={`text-white flex flex-col z-50 shadow-lg shrink-0 overflow-hidden transition-all duration-300 sticky top-0 h-screen ${isCollapsed ? 'w-[80px] p-4 items-center gap-4' : 'w-[260px] p-5 gap-5'
        }`}
      style={{
        background: `linear-gradient(180deg, ${currentAccent.hover} 0%, ${currentAccent.primary} 56%, ${currentAccent.primary} 100%)`,
        boxShadow: `0 18px 45px ${currentAccent.glow}`,
      }}
    >
      <div className={`flex w-full ${isCollapsed ? 'flex-col items-center gap-4' : 'items-center justify-between gap-2.5'}`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <img src="/hireiq.png" alt="Hire IQ Logo" className="w-8 h-8 object-contain" />
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-primary text-sm font-extrabold shrink-0 shadow-sm">
            <Shield size={16} fill="currentColor" style={{ color: currentAccent.primary }} />
          </div>
          {!isCollapsed && (
            <strong className="text-xl font-bold tracking-tight text-white font-title truncate">Hire IQ</strong>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white border-none cursor-pointer outline-none transition-colors shrink-0"
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
                } ${isActive && activeTab !== 'live' ? 'bg-white/18 text-white font-semibold' : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <Icon size={16} className="shrink-0" />
              {!isCollapsed && <span>{label}</span>}
            </NavLink>
          )
        })}

        <div className="border-t border-white/10 my-2 w-full" />
        <button
          onClick={() => onTabChange('live')}
          title={isCollapsed ? "Live Results" : ""}
          className={`text-left flex items-center rounded-lg font-medium text-sm transition-all border-none outline-none cursor-pointer ${isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3 w-full'
            } ${activeTab === 'live' ? 'bg-white/18 text-white font-semibold' : 'text-white/70 hover:bg-white/8 hover:text-white'
            }`}
        >
          <Radio size={16} className="shrink-0" />
          {!isCollapsed && <span>Live Results</span>}
        </button>
      </nav>

      <button
        onClick={onLogout}
        title={isCollapsed ? "Logout" : ""}
        className={`text-left flex items-center border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all ${isCollapsed ? 'justify-center p-2 rounded-xl' : 'px-3.5 py-2 rounded-lg gap-3 w-full'
          }`}
      >
        <LogOut size={16} className="shrink-0" />
        {!isCollapsed && <span>Logout</span>}
      </button>
    </aside>
  )
}
