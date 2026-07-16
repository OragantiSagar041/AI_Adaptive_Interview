import React, { useState } from 'react'
import Sidebar from '../Sidebar'
import SuperAdminSidebar from '../SuperAdminSidebar'
import Navbar from '../Navbar'
import AdminCopilot from './copilot/AdminCopilot'

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace('#', '')
  const value = parseInt(cleanHex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function AdminLayout({
  children,
  activeTab,
  accentColors,
  accentName,
  currentAccent,
  adminUser,
  onAccentChange,
  onLogout,
  onTabChange,
  onAddCredits,
  role,
}) {
  const accentWash = hexToRgba(currentAccent.primary, 0.16)
  const accentWashStrong = hexToRgba(currentAccent.primary, 0.26)
  const accentPage = hexToRgba(currentAccent.primary, 0.12)
  const accentPageStrong = hexToRgba(currentAccent.primary, 0.20)

  const [isCollapsed, setIsCollapsed] = useState(false)
  const SidebarComponent = role === 'superadmin' ? SuperAdminSidebar : Sidebar;

  return (
      <div
        className="grid grid-cols-1 min-h-screen text-slate-900"
        style={{
          gridTemplateColumns: isCollapsed ? '80px 1fr' : '260px 1fr',
          background: `radial-gradient(ellipse 700px 600px at 50% 25%, ${accentPageStrong} 0%, ${accentPage} 25%, ${accentWash} 50%, transparent 80%), linear-gradient(180deg, ${accentPage} 0%, #f8fafc 100%)`,
        }}
      >
      <SidebarComponent
        activeTab={activeTab}
        currentAccent={currentAccent}
        onLogout={onLogout}
        onTabChange={onTabChange}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />

      <div className="flex flex-col min-w-0">
        <Navbar
          accentColors={accentColors}
          accentName={accentName}
          currentAccent={currentAccent}
          adminUser={adminUser}
          onAccentChange={onAccentChange}
          onLogout={onLogout}
          onAddCredits={onAddCredits}
        />

        <main
          className="p-8 flex-grow overflow-y-auto"
          style={{
            background: `radial-gradient(ellipse 700px 600px at 20% 10%, ${hexToRgba(currentAccent.primary, 0.14)} 0%, ${hexToRgba(currentAccent.primary, 0.08)} 18%, ${hexToRgba(currentAccent.hover, 0.04)} 40%, transparent 78%), linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.88) 45%, #ffffff 100%)`,
          }}
        >
          {children}
        </main>
      </div>
      
      {/* Global Admin Copilot */}
      <AdminCopilot />
    </div>
  )
}
