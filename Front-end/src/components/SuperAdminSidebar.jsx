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
} from 'lucide-react'

export default function SuperAdminSidebar({
  activeTab,
  onTabChange,
  onLogout,
  currentAccent,
  isCollapsed,
  setIsCollapsed,
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
      className={`text-white flex flex-col z-50 shadow-lg shrink-0 overflow-hidden transition-all duration-300 ${
        isCollapsed ? 'w-[80px] p-4 items-center gap-4 h-screen' : 'w-[260px] p-5 gap-5 h-screen'
      }`}
      style={{
        background: `
          radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.12), transparent 24%),
          linear-gradient(180deg, rgba(20, 37, 91, 0.96) 0%, rgba(30, 58, 138, 0.94) 46%, rgba(37, 99, 235, 0.9) 100%)
        `,
        boxShadow: `0 20px 60px rgba(15, 23, 42, 0.12)`
      }}
    >
      <div className={`flex w-full ${isCollapsed ? 'flex-col items-center gap-4' : 'items-center justify-between gap-2.5'}`}>
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-primary text-sm font-extrabold shrink-0 shadow-sm">
            <Shield size={16} fill="currentColor" style={{ color: '#4f46e5' }} />
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
        {!isCollapsed && (
          <div className="text-[0.62rem] font-bold text-white/50 uppercase tracking-widest px-3 mb-1">
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
              className={`w-full text-left flex items-center rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${
                isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3'
              } ${isActive
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
                }`}
            >
              <Icon size={16} className="shrink-0" />
              {!isCollapsed && <span>{label}</span>}
            </button>
          )
        })}


        <div className="border-t border-white/10 my-2 w-full" />
        <button
          onClick={() => handleTabClick('live')}
          title={isCollapsed ? "Live Results" : ""}
          className={`text-left flex items-center rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${
            isCollapsed ? 'justify-center p-2' : 'px-3.5 py-2 gap-3 w-full'
          } ${activeTab === 'live'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
            }`}
        >
          <Radio size={16} className="shrink-0" />
          {!isCollapsed && <span>Live Results</span>}
        </button>
      </nav>

      <button
        onClick={onLogout}
        title={isCollapsed ? "Logout" : ""}
        className={`text-left flex items-center border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all ${
          isCollapsed ? 'justify-center p-2 rounded-xl' : 'px-3.5 py-2 rounded-lg gap-3 w-full'
        }`}
      >
        <LogOut size={16} className="shrink-0" />
        {!isCollapsed && <span>Logout</span>}
      </button>
    </aside>
  )
}
