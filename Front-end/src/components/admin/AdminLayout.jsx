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
      className="grid grid-cols-1 min-h-screen text-[#0f172a]"
      style={{
        gridTemplateColumns: isCollapsed ? '80px 1fr' : '260px 1fr',
        background: `
          radial-gradient(circle at 8% 0%, ${accentWashStrong} 0, transparent 34%),
          radial-gradient(circle at 92% 12%, ${accentWash} 0, transparent 30%),
          linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.08)} 0%, #ffffff 42%, ${hexToRgba(currentAccent.primary, 0.10)} 100%)
        `,
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
            background: `
              radial-gradient(circle at 0% 0%, ${accentPageStrong} 0, transparent 28%),
              radial-gradient(circle at 100% 18%, ${accentPage} 0, transparent 30%),
              linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.10)} 0%, rgba(255,255,255,0.66) 38%, ${hexToRgba(currentAccent.primary, 0.08)} 100%)
            `,
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
