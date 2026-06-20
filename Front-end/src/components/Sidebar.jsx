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
} from 'lucide-react'

export default function Sidebar({
  activeTab,
  onTabChange,
  onLogout,
  currentAccent,
}) {
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle, path: '/admin/qualified-candidates' },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle, path: '/admin/rejected-candidates' },
    { id: 'create', label: 'Create Interview', icon: Plus, path: '/admin/create-interview' },
    { id: 'settings', label: 'Profile Settings', icon: Settings, path: '/admin/profile-settings' },
  ]

  return (
    <aside
      className="text-white p-6 flex flex-col gap-8 sticky top-0 h-screen z-50 shadow-lg shrink-0 w-[260px]"
      style={{
        background: `linear-gradient(180deg, ${currentAccent.hover} 0%, ${currentAccent.primary} 56%, ${currentAccent.primary} 100%)`,
        boxShadow: `0 18px 45px ${currentAccent.glow}`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-primary text-sm font-extrabold shadow-sm">
          <Shield size={16} fill="currentColor" style={{ color: currentAccent.primary }} />
        </div>
        <strong className="text-xl font-bold tracking-tight text-white font-title">Hire IQ</strong>
      </div>

      <nav className="flex flex-col gap-2 flex-grow overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon, path }) => {
          return (
            <NavLink
              key={id}
              to={path}
              className={({ isActive }) =>
                `w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-all border-none outline-none cursor-pointer no-underline ${
                  isActive && activeTab !== 'live' ? 'bg-white/18 text-white font-semibold' : 'text-white/70 hover:bg-white/8 hover:text-white'
                }`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          )
        })}

        <div className="border-t border-white/10 my-2" />
        <button
          onClick={() => onTabChange('live')}
          className={`w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg font-medium text-sm transition-all border-none outline-none cursor-pointer ${
            activeTab === 'live' ? 'bg-white/18 text-white font-semibold' : 'text-white/70 hover:bg-white/8 hover:text-white'
          }`}
        >
          <Radio size={16} /> Live Results
        </button>
      </nav>

      <button
        onClick={onLogout}
        className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-lg font-medium text-sm border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all"
      >
        <LogOut size={16} /> Logout
      </button>
    </aside>
  )
}
