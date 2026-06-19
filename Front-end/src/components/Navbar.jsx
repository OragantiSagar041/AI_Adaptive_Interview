import React from 'react'
import { LogOut } from 'lucide-react'

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace('#', '')
  const value = parseInt(cleanHex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function Navbar({
  accentColors,
  accentName,
  currentAccent,
  adminUser,
  onAccentChange,
  onLogout,
}) {
  return (
    <header
      className="border-b px-8 py-4 flex justify-between items-center text-[#1e293b] shadow-sm backdrop-blur-md"
      style={{
        background: `linear-gradient(90deg, rgba(255,255,255,0.92), ${hexToRgba(currentAccent.primary, 0.14)})`,
        borderColor: hexToRgba(currentAccent.primary, 0.22),
      }}
    >
      <div>
        <h2 className="text-xl font-bold text-slate-800">Admin Console</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-full p-1 border border-slate-200">
          {Object.keys(accentColors).map(color => (
            <button
              key={color}
              onClick={() => onAccentChange(color)}
              className="w-3.5 h-3.5 rounded-full border-2 border-white cursor-pointer p-0 transition-all"
              style={{
                background: accentColors[color].primary,
                boxShadow: accentName === color ? `0 0 0 2px ${accentColors[color].primary}` : 'none',
              }}
              title={color}
            />
          ))}
        </div>

        <div className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full pl-4 pr-1.5 py-1 text-sm font-bold shadow-sm">
          <i className="fas fa-layer-group text-[10px]"></i>
          {adminUser?.subscription_plan || 'Advance'} • {adminUser?.credits ?? 0} credits left
          <button 
            onClick={onAddCredits}
            className="ml-1 w-5 h-5 flex items-center justify-center bg-primary text-white rounded-full hover:bg-primary-hover shadow-md transition-colors"
            title={adminUser?.role === 'superadmin' ? 'Buy Credits' : 'Request Credits'}
          >
            <i className="fas fa-plus text-[10px]"></i>
          </button>
        </div>

        <span className="text-sm text-slate-600">
          Welcome back, <strong className="text-slate-800">{adminUser?.name || 'admin'}</strong>
        </span>

        <button
          onClick={onLogout}
          className="px-3 py-1.5 bg-transparent border border-slate-200 rounded-lg cursor-pointer text-slate-600 hover:text-slate-800 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-semibold"
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </header>
  )
}
