import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import axios from 'axios'

export default function SuperDashboardPage() {
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminUser = useSelector(state => state.auth.adminUser)

  // Super Admin stats and data states
  const [credits, setCredits] = useState(0)
  const [totalSessions, setTotalSessions] = useState(0)
  const [completedSessions, setCompletedSessions] = useState(0)
  const [pendingSessions, setPendingSessions] = useState(0)

  // Chart Canvas references
  const saUsageChartRef = useRef(null)
  const saAdminPieChartRef = useRef(null)
  const saCreditsDoughnutChartRef = useRef(null)

  // Chart Instances
  const saUsageChartInstance = useRef(null)
  const saAdminPieChartInstance = useRef(null)
  const saCreditsDoughnutChartInstance = useRef(null)

  const destroyCharts = () => {
    if (saUsageChartInstance.current) {
      saUsageChartInstance.current.destroy()
      saUsageChartInstance.current = null
    }
    if (saAdminPieChartInstance.current) {
      saAdminPieChartInstance.current.destroy()
      saAdminPieChartInstance.current = null
    }
    if (saCreditsDoughnutChartInstance.current) {
      saCreditsDoughnutChartInstance.current.destroy()
      saCreditsDoughnutChartInstance.current = null
    }
  }

  const loadStatsAndCharts = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/super-admin/dashboard-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = res.data
      setCredits(data.credits || 0)
      setTotalSessions(data.total_sessions || 0)
      setCompletedSessions(data.completed_sessions || 0)
      setPendingSessions(data.pending_sessions || 0)

      // Fetch sub-admins and dashboard sessions concurrently to build correct admin metrics
      let subAdmins = []
      let candidates = []
      try {
        const [subAdminsRes, dashboardRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/super-admin/admins`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          axios.get(`${API_BASE_URL}/superadmin/dashboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ])
        subAdmins = subAdminsRes.data?.data || []
        candidates = dashboardRes.data?.candidates || []
      } catch (e) {
        console.error('Failed to load sub-admins or dashboard sessions', e)
      }

      // Map admin ID to Name
      const adminMap = {}
      const superAdminId = adminUser?.admin_id || adminUser?.id || adminUser?._id
      const superAdminName = adminUser?.name || adminUser?.username || 'Super Admin'
      if (superAdminId) {
        adminMap[superAdminId] = superAdminName
      }
      subAdmins.forEach(admin => {
        const id = admin.id || admin._id
        const name = admin.name || admin.username || 'Sub Admin'
        if (id) {
          adminMap[id] = name
        }
      })

      // Count sessions by admin
      const adminCounts = {}
      Object.keys(adminMap).forEach(id => {
        adminCounts[id] = 0
      })

      candidates.forEach(session => {
        const createdBy = session.created_by
        if (createdBy) {
          if (adminCounts[createdBy] === undefined) {
            adminCounts[createdBy] = 0
            adminMap[createdBy] = `Admin (${createdBy.substring(0, 6)})`
          }
          adminCounts[createdBy] += 1
        }
      })

      const adminLabels = []
      const adminData = []
      Object.entries(adminMap).forEach(([id, name]) => {
        adminLabels.push(name)
        adminData.push(adminCounts[id] || 0)
      })

      // Draw Charts
      destroyCharts()

      // Dynamically get the current primary/accent color from CSS custom properties
      const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#6366f1'

      const ctxUsage = saUsageChartRef.current
      if (ctxUsage && window.Chart) {
        saUsageChartInstance.current = new window.Chart(ctxUsage, {
          type: 'line',
          data: {
            labels: data.chart_labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
              label: 'Interviews Created',
              data: data.chart_data || [0, 0, 0, 0, 0, 0, 0],
              borderColor: primaryColor,
              backgroundColor: `${primaryColor}1A`,
              tension: 0.4,
              fill: true
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
          }
        })
      }

      const ctxPie = saAdminPieChartRef.current
      if (ctxPie && window.Chart) {
        saAdminPieChartInstance.current = new window.Chart(ctxPie, {
          type: 'bar',
          data: {
            labels: adminLabels.length > 0 ? adminLabels : ['No Admins'],
            datasets: [{
              label: 'Interviews Created',
              data: adminData.length > 0 ? adminData : [0],
              backgroundColor: primaryColor,
              borderRadius: 6,
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { stepSize: 1 }
              },
              x: {
                grid: { display: false }
              }
            }
          }
        })
      }

      const ctxCredits = saCreditsDoughnutChartRef.current
      if (ctxCredits && window.Chart) {
        saCreditsDoughnutChartInstance.current = new window.Chart(ctxCredits, {
          type: 'doughnut',
          data: {
            labels: ['Credits Used', 'Credits Available'],
            datasets: [{
              data: [data.total_sessions || 0, data.credits || 0],
              backgroundColor: ['#ef4444', '#10b981']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } }
          }
        })
      }
    } catch (err) {
      console.error('Super admin dashboard stats load error', err)
    }
  }

  // Load stats initially
  useEffect(() => {
    if (token) {
      loadStatsAndCharts()
    }
    return () => {
      destroyCharts()
    }
  }, [token])

  // Observe HTML style changes (accent changes) to trigger chart redraws
  useEffect(() => {
    const observer = new MutationObserver(() => {
      loadStatsAndCharts()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [token])

  return (
    <div className="space-y-6 md:space-y-8 max-w-6xl">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center gap-2">
          <div>
            <span className="text-[0.62rem] md:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Available Credits</span>
            <h3 className="text-2xl md:text-3xl font-extrabold mt-1 text-emerald-500">{credits}</h3>
          </div>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center shrink-0 text-lg md:text-xl">
            <i className="fas fa-coins" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center gap-2">
          <div>
            <span className="text-[0.62rem] md:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Total Interviews</span>
            <h3 className="text-2xl md:text-3xl font-extrabold mt-1 text-slate-900">{totalSessions}</h3>
          </div>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center shrink-0 text-lg md:text-xl">
            <i className="fas fa-video" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center gap-2">
          <div>
            <span className="text-[0.62rem] md:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Completed</span>
            <h3 className="text-2xl md:text-3xl font-extrabold mt-1 text-slate-900">{completedSessions}</h3>
          </div>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center shrink-0 text-lg md:text-xl">
            <i className="fas fa-check-circle" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center gap-2">
          <div>
            <span className="text-[0.62rem] md:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Pending</span>
            <h3 className="text-2xl md:text-3xl font-extrabold mt-1 text-slate-900">{pendingSessions}</h3>
          </div>
          <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center shrink-0 text-lg md:text-xl">
            <i className="fas fa-clock" />
          </div>
        </div>
      </div>

      {/* Data Visualization Charts Area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr_1fr] gap-4 md:gap-6">
        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Interviews Last 7 Days</h3>
          <div className="h-[280px] w-full relative">
            <canvas ref={saUsageChartRef} id="saUsageChart" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Interviews by Admin</h3>
          <div className="h-[280px] w-full relative">
            <canvas ref={saAdminPieChartRef} id="saAdminPieChart" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 md:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Credits Used vs Available</h3>
          <div className="h-[280px] w-full relative">
            <canvas ref={saCreditsDoughnutChartRef} id="saCreditsDoughnutChart" />
          </div>
        </div>
      </div>
    </div>
  )
}
