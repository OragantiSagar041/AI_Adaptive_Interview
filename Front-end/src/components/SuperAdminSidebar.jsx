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
} from 'lucide-react'

export default function SuperAdminSidebar({
  activeTab,
  onTabChange,
  onLogout,
  currentAccent,
}) {
  const location = useLocation()

  const superNavItems = [
    { id: 'super-dashboard', label: 'Super Admin Dashboard', icon: BarChart2 },
    { id: 'team', label: 'Team Management', icon: Users },
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle },
    { id: 'create', label: 'Create Interview', icon: Plus },
    { id: 'settings', label: 'Profile Settings', icon: Settings },
  ]

  // Derive active tab from URL query param matching the activeTab prop
  const handleTabClick = (id) => {
    onTabChange(id)
  }

  return (
    <aside
      className="text-white p-6 flex flex-col gap-8 sticky top-0 h-screen z-50 shadow-lg shrink-0 w-[260px] overflow-hidden"
      style={{
        background: `
          radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.12), transparent 24%),
          linear-gradient(180deg, rgba(20, 37, 91, 0.96) 0%, rgba(30, 58, 138, 0.94) 46%, rgba(37, 99, 235, 0.9) 100%)
        `,
        boxShadow: `0 20px 60px rgba(15, 23, 42, 0.12)`
      }}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-primary text-sm font-extrabold shadow-sm">
          <Shield size={16} fill="currentColor" style={{ color: '#4f46e5' }} />
        </div>
        <strong className="text-xl font-bold tracking-tight text-white font-title">Hire IQ</strong>
      </div>

      <nav className="flex flex-col gap-2 flex-grow overflow-y-auto">
        <div className="text-[0.62rem] font-bold text-white/50 uppercase tracking-widest px-3 mb-1">
          Super Admin Control
        </div>
        {superNavItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id

          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${isActive
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
                }`}
            >
              <Icon size={16} /> {label}
            </button>
          )
        })}


        <div className="border-t border-white/10 my-2" />
        <button
          onClick={() => handleTabClick('live')}
          className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${activeTab === 'live'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
            }`}
        >
          <Radio size={16} /> Live Results
        </button>
      </nav>

      <button
        onClick={onLogout}
        className="w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all"
      >
        <LogOut size={16} /> Logout
      </button>
    </aside>
  )
}
