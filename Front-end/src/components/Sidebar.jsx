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
} from 'lucide-react'
import logoImage from '../assets/final.png'

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace('#', '')
  const value = parseInt(cleanHex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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
    { id: 'conversational-flow', label: 'Conversational Flow', icon: MessageSquare, path: '/admin/conversational-flow' },
    { id: 'settings', label: 'Profile Settings', icon: Settings, path: '/admin/profile-settings' },
  ]

  return (
    <aside
      className={`text-slate-900 flex flex-col z-50 shrink-0 overflow-hidden transition-all duration-300 sticky top-0 h-screen ${isCollapsed ? 'w-[80px] p-4 items-center gap-4' : 'w-[260px] p-0 gap-0'}
        }`}
      style={{
        background: `radial-gradient(ellipse 350px 600px at 15% 10%, ${hexToRgba(currentAccent.primary, 0.14)} 0%, ${hexToRgba(currentAccent.primary, 0.08)} 20%, ${hexToRgba(currentAccent.hover, 0.05)} 38%, transparent 82%), linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 40%, #ffffff 100%)`,
        boxShadow: `0 24px 80px ${hexToRgba(currentAccent.glow ? currentAccent.glow : currentAccent.primary, 0.12)}`,
      }}
    >
      <div className={`flex w-full ${isCollapsed ? 'flex-col items-center gap-4' : 'items-center justify-between gap-2.5'}`}>
        <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? '' : 'px-6 h-16 border-b border-slate-200'}`}>
          <img src={logoImage} alt="Hire IQ Logo" className="w-8 h-8 object-contain" />
          {!isCollapsed && (
            <div className="leading-tight">
              <strong className="text-sm font-semibold text-slate-900">HireIQ</strong>
              <div className="text-[11px] text-slate-500">Admin</div>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded-lg bg-transparent hover:bg-transparent text-slate-600 hover:text-white cursor-pointer outline-none transition-colors shrink-0"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className={`flex ${isCollapsed ? 'flex-col gap-2 p-0' : 'flex-col gap-1.5 flex-1 overflow-y-auto p-3'} w-full scrollbar-none`}>
        {navItems.map(({ id, label, icon: Icon, path }) => {
          return (
            <NavLink
              key={id}
              to={path}
              title={isCollapsed ? label : ""}
              className={({ isActive }) =>
                `flex items-center gap-3 ${isCollapsed ? 'justify-center p-2' : 'px-3 py-2'} rounded-md text-sm font-semibold transition-colors outline-none cursor-pointer no-underline ${isActive && activeTab !== 'live' ? 'text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`
              }
              style={({ isActive }) => ({
                background: isActive && activeTab !== 'live' ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)` : 'transparent'
              })}
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
          className={`flex items-center gap-3 ${isCollapsed ? 'justify-center p-2' : 'px-3 py-2 w-full'} rounded-md text-sm font-semibold transition-colors outline-none cursor-pointer ${activeTab === 'live' ? 'text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          style={activeTab === 'live' ? { background: `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)` } : { background: 'transparent' }}
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
