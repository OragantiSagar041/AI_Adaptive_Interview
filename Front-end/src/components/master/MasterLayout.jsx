import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Tags,
  Users,
  UserPlus,
  Radio,
  Shield,
  LogOut,
  User,
  Settings,
  ChevronDown
} from 'lucide-react'
import { logout } from '../../store/slices/authSlice'
import { persistor } from '../../store/store'

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace('#', '')
  const value = parseInt(cleanHex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function MasterLayout() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const location = useLocation()

  // Selectors
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const adminUser = useSelector(state => state.auth.adminUser)

  // Local theme states
  const [accentName, setAccentName] = useState('indigo')
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const accentColors = {
    teal: { primary: '#0d9488', hover: '#0f766e', glow: 'rgba(13, 148, 136, 0.15)' },
    indigo: { primary: '#6366f1', hover: '#4f46e5', glow: 'rgba(99, 102, 241, 0.15)' },
    purple: { primary: '#9333ea', hover: '#7e22ce', glow: 'rgba(147, 51, 234, 0.15)' },
    red: { primary: '#e11d48', hover: '#be123c', glow: 'rgba(225, 29, 72, 0.15)' },
    green: { primary: '#16a34a', hover: '#15803d', glow: 'rgba(22, 163, 74, 0.15)' },
    blue: { primary: '#2563eb', hover: '#1d4ed8', glow: 'rgba(37, 99, 237, 0.15)' }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
    document.documentElement.style.setProperty('--primary-glow', currentAccent.glow)
  }, [accentName, currentAccent])

  const handleLogout = () => {
    sessionStorage.clear()
    dispatch(logout())
    persistor.purge()
    navigate('/login')
  }

  const accentWash = hexToRgba(currentAccent.primary, 0.16)
  const accentWashStrong = hexToRgba(currentAccent.primary, 0.26)
  const accentPage = hexToRgba(currentAccent.primary, 0.12)
  const accentPageStrong = hexToRgba(currentAccent.primary, 0.20)

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/master/dashboard' },
    { id: 'plans', label: 'Plans', icon: Tags, path: '/master/plans' },
    { id: 'subscribers', label: 'Subscribers', icon: Users, path: '/master/subscribers' },
    { id: 'create-tenant', label: 'Create Tenant', icon: UserPlus, path: '/master/create-tenant' },
  ]

  const getPageTitle = () => {
    const path = location.pathname
    if (path.includes('dashboard')) return 'Subscription Monitor'
    if (path.includes('plans')) return 'Product Pricing & Plans'
    if (path.includes('subscribers')) return 'Subscribed Companies'
    if (path.includes('create-tenant')) return 'Provision Tenant Account'
    return 'Master Console'
  }

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-screen text-[#0f172a]"
      style={{
        background: `
          radial-gradient(circle at 8% 0%, ${accentWashStrong} 0, transparent 34%),
          radial-gradient(circle at 92% 12%, ${accentWash} 0, transparent 30%),
          linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.08)} 0%, #ffffff 42%, ${hexToRgba(currentAccent.primary, 0.10)} 100%)
        `,
      }}
    >
      {/* Sidebar */}
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
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-indigo-700 text-sm font-extrabold shadow-sm">
            <Shield size={16} fill="currentColor" />
          </div>
          <strong className="text-xl font-bold tracking-tight text-white font-title">Hire IQ</strong>
        </div>

        <nav className="flex flex-col gap-2 flex-grow overflow-y-auto">
          <div className="text-[0.62rem] font-bold text-white/50 uppercase tracking-widest px-3 mb-1">
            Master Control
          </div>
          {navItems.map(({ id, label, icon: Icon, path }) => (
            <NavLink
              key={id}
              to={path}
              className={({ isActive }) =>
                `w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer no-underline ${
                  isActive
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}

          <div className="border-t border-white/10 my-2" />
          
          {/* Pulsing Live Monitor Indicator */}
          <div className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 select-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live Monitor Active
          </div>
        </nav>

        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all"
        >
          <LogOut size={16} /> Logout
        </button>
      </aside>

      {/* Main Panel */}
      <div className="flex flex-col min-w-0">
        {/* Navbar */}
        <header
          className="border-b px-8 py-4 flex justify-between items-center text-[#1e293b] shadow-sm backdrop-blur-md"
          style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0.92), ${hexToRgba(currentAccent.primary, 0.14)})`,
            borderColor: hexToRgba(currentAccent.primary, 0.22),
          }}
        >
          <div>
            <h2 className="text-xl font-bold text-slate-800">{getPageTitle()}</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-full p-1 border border-slate-200">
              {Object.keys(accentColors).map(color => (
                <button
                  key={color}
                  onClick={() => setAccentName(color)}
                  className="w-3.5 h-3.5 rounded-full border-2 border-white cursor-pointer p-0 transition-all"
                  style={{
                    background: accentColors[color].primary,
                    boxShadow: accentName === color ? `0 0 0 2px ${accentColors[color].primary}` : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>

            <span className="text-sm text-slate-600">
              Welcome back, <strong className="text-slate-800">{adminUser?.username || 'Master Admin'}</strong>
            </span>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1.5 hover:bg-slate-50 rounded-xl transition-all cursor-pointer border border-slate-200 bg-white"
              >
                <img
                  src="https://i.pravatar.cc/150?u=masteradmin"
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover"
                />
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-semibold text-slate-800 leading-none">{adminUser?.username || 'Master Admin'}</div>
                  <span className="text-[10px] text-slate-400 font-medium">Master Control</span>
                </div>
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                    <NavLink
                      to="/master/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 no-underline"
                    >
                      <User size={14} /> My Profile
                    </NavLink>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setDropdownOpen(false);
                      }}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 no-underline"
                    >
                      <Settings size={14} /> Settings
                    </a>
                    <hr className="border-slate-100 my-1" />
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        handleLogout();
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-medium cursor-pointer border-none bg-transparent"
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main
          className="p-8 flex-grow overflow-y-auto"
          style={{
            background: `
              radial-gradient(circle at 0% 0%, ${accentPageStrong} 0, transparent 28%),
              radial-gradient(circle at 100% 18%, ${accentPage} 0, transparent 30%),
              linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.10)} 0%, rgba(255,255,255,0.66) 38%, ${hexToRgba(currentAccent.primary, 0.08)} 100%)
            `,
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
