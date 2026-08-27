import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw,
  Plus,
  Building,
  Video,
  Server,
  ArrowUp,
  IndianRupee,
  Calendar,
  CalendarDays,
  RotateCcw,
  Filter,
  CheckCircle2
} from 'lucide-react'
import axios from 'axios'

export default function MasterDashboard() {
  const navigate = useNavigate()
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminId = sessionStorage.getItem('adminId') || ''

  // Date Filter State
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [activePreset, setActivePreset] = useState('all')

  // Dashboard state
  const [companies, setCompanies] = useState([])
  const [stats, setStats] = useState({
    mrr_inr: 0,
    currency_symbol: '₹',
    growth_pct: 0,
    total_companies: 0,
    active_companies: 0,
    total_interviews_conducted: 0,
    completed_interviews: 0,
    system_health: '100%',
    system_status: 'Operational',
    latency_ms: 0,
    is_filtered: false,
    mrr_chart: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'], values: [0, 0, 0, 0, 0, 0] },
    plan_distribution: {}
  })
  const [loading, setLoading] = useState(false)

  // Chart Canvas references
  const mrrChartRef = useRef(null)
  const planDistChartRef = useRef(null)

  // Chart Instances
  const mrrChartInstance = useRef(null)
  const planDistChartInstance = useRef(null)

  const fetchDashboardData = async (customStart = startDate, customEnd = endDate) => {
    setLoading(true)
    try {
      const headers = { 'Authorization': `Bearer ${token}` }
      let queryParams = `master_id=${encodeURIComponent(adminId)}`
      if (customStart) queryParams += `&start_date=${encodeURIComponent(customStart)}`
      if (customEnd) queryParams += `&end_date=${encodeURIComponent(customEnd)}`

      const [companiesRes, statsRes] = await Promise.allSettled([
        axios.get(`${API_BASE_URL}/master/companies?${queryParams}`, { headers }),
        axios.get(`${API_BASE_URL}/master/stats?${queryParams}`, { headers })
      ])

      if (companiesRes.status === 'fulfilled' && companiesRes.value.data?.status === 'success') {
        setCompanies(companiesRes.value.data.data || [])
      }

      if (statsRes.status === 'fulfilled' && statsRes.value.data?.status === 'success') {
        setStats(statsRes.value.data.data)
      }
    } catch (e) {
      console.error('Failed to fetch dashboard data:', e)
    } finally {
      setLoading(false)
    }
  }

  // Format YYYY-MM-DD
  const formatDateLocal = (date) => {
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // Apply quick presets
  const handlePresetSelect = (presetKey) => {
    const today = new Date()
    let start = ''
    let end = ''

    if (presetKey === 'all') {
      start = ''
      end = ''
    } else if (presetKey === 'today') {
      start = formatDateLocal(today)
      end = formatDateLocal(today)
    } else if (presetKey === '7days') {
      const past7 = new Date()
      past7.setDate(today.getDate() - 6)
      start = formatDateLocal(past7)
      end = formatDateLocal(today)
    } else if (presetKey === '30days') {
      const past30 = new Date()
      past30.setDate(today.getDate() - 29)
      start = formatDateLocal(past30)
      end = formatDateLocal(today)
    } else if (presetKey === 'this_month') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
      start = formatDateLocal(firstDay)
      end = formatDateLocal(today)
    }

    setStartDate(start)
    setEndDate(end)
    setActivePreset(presetKey)
    fetchDashboardData(start, end)
  }

  const handleCustomDateChange = (type, value) => {
    setActivePreset('custom')
    if (type === 'start') {
      let newEnd = endDate
      if (endDate && value > endDate) {
        newEnd = value
        setEndDate(value)
      }
      setStartDate(value)
      fetchDashboardData(value, newEnd)
    } else {
      let newEnd = value
      if (startDate && value < startDate) {
        newEnd = startDate
      }
      setEndDate(newEnd)
      fetchDashboardData(startDate, newEnd)
    }
  }

  const handleResetFilter = () => {
    handlePresetSelect('all')
  }

  const destroyCharts = () => {
    if (mrrChartInstance.current) {
      mrrChartInstance.current.destroy()
      mrrChartInstance.current = null
    }
    if (planDistChartInstance.current) {
      planDistChartInstance.current.destroy()
      planDistChartInstance.current = null
    }
  }

  const renderCharts = () => {
    destroyCharts()

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#6366f1'

    // MRR / Sales Line Chart
    const ctxMrr = mrrChartRef.current
    if (ctxMrr && window.Chart) {
      const chartLabels = stats.mrr_chart?.labels || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
      const chartValues = stats.mrr_chart?.values || [0, 0, 0, 0, 0, stats.mrr_inr]
      const labelText = stats.is_filtered ? 'Sales (₹)' : 'MRR (₹)'

      mrrChartInstance.current = new window.Chart(ctxMrr, {
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [{
            label: labelText,
            data: chartValues,
            borderColor: primaryColor,
            backgroundColor: `${primaryColor}1A`,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: primaryColor
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function (context) {
                  return ` ${labelText}: ₹${(context.parsed.y || 0).toLocaleString('en-IN')}`
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.05)' },
              ticks: {
                callback: function (value) {
                  return `₹${value.toLocaleString('en-IN')}`
                }
              }
            },
            x: { grid: { display: false } }
          }
        }
      })
    }

    // Plan Distribution Doughnut Chart
    const ctxPlan = planDistChartRef.current
    if (ctxPlan && window.Chart) {
      const dist = stats.plan_distribution || {}
      const labels = Object.keys(dist).length ? Object.keys(dist) : ['Free Trial', 'Basic Plan', 'Advance Plan']
      const dataVals = Object.keys(dist).length ? Object.values(dist) : [1, 0, 0]

      planDistChartInstance.current = new window.Chart(ctxPlan, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataVals,
            backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      })
    }
  }

  useEffect(() => {
    if (token) {
      fetchDashboardData()
    }
  }, [token])

  useEffect(() => {
    renderCharts()
    return () => destroyCharts()
  }, [stats])

  // Redraw charts when primary color switcher modifications happen
  useEffect(() => {
    const observer = new MutationObserver(() => {
      renderCharts()
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [stats])

  return (
    <div className="space-y-6 w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Master Console Overview</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real-time sales, MRR (INR), and date-filtered platform analytics.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            onClick={() => fetchDashboardData()}
            disabled={loading}
            className="flex-1 sm:flex-initial px-4 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 dark:bg-slate-900/50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Data
          </button>
          <button
            onClick={() => navigate('/master/create-tenant')}
            className="flex-1 sm:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-md"
          >
            <Plus size={16} /> Create Tenant
          </button>
        </div>
      </div>

      {/* Date-wise Sales Filter Control Card */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 p-4 sm:p-5 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Quick Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter size={13} className="text-slate-500 dark:text-slate-400" /> Filter:
            </span>
            {[
              { key: 'all', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: '7days', label: 'Last 7 Days' },
              { key: '30days', label: 'Last 30 Days' },
              { key: 'this_month', label: 'This Month' }
            ].map(preset => {
              const isActive = activePreset === preset.key;
              return (
                <button
                  key={preset.key}
                  onClick={() => handlePresetSelect(preset.key)}
                  style={isActive ? { backgroundColor: '#4f46e5', color: '#ffffff', borderColor: '#4338ca' } : {}}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive
                    ? 'shadow-md shadow-indigo-500/30 ring-2 ring-indigo-400'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Date Picker Form: From & To */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-inner">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleCustomDateChange('start', e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 shadow-inner">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">To:</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => handleCustomDateChange('end', e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
              />
            </div>

            {(startDate || endDate || activePreset !== 'all') && (
              <button
                onClick={handleResetFilter}
                title="Reset to All Time"
                className="px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800/50 hover:bg-red-50 text-slate-600 dark:text-slate-400 hover:text-red-600 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1 border border-slate-200 dark:border-slate-700"
              >
                <RotateCcw size={12} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter Summary Banner */}
        {stats.is_filtered && (
          <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs text-indigo-700 font-medium animate-fadeIn">
            <CheckCircle2 size={14} className="text-indigo-600 shrink-0" />
            <span>
              Filtered Sales from <strong>{startDate || 'Beginning'}</strong> to <strong>{endDate || 'Today'}</strong> — Showing <strong>₹{stats.mrr_inr.toLocaleString('en-IN')}</strong> sales revenue.
            </span>
          </div>
        )}
      </div>

      {/* Real-time Dynamic Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* MRR / Sales Card (INR) */}
        <div
          onClick={() => navigate('/master/subscribers')}
          className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 sm:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none flex justify-between items-start gap-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-emerald-200"
        >
          <div>
            <span className="text-[0.62rem] sm:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">
              {stats.is_filtered ? 'Sales In Range' : 'Monthly Recurring Revenue'}
            </span>
            <h3 className="text-xl sm:text-3xl font-extrabold mt-1.5 text-slate-900 dark:text-white">
              ₹{stats.mrr_inr.toLocaleString('en-IN')}
            </h3>
            <span className="text-[10px] sm:text-xs text-emerald-500 font-semibold flex items-center gap-1 mt-2">
              <ArrowUp size={12} /> {stats.is_filtered ? 'Active range sales' : `${stats.growth_pct}% growth`}
            </span>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-emerald-500/15 dark:bg-emerald-500/25 border border-emerald-400/30 text-emerald-600 dark:text-emerald-400 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
            <IndianRupee className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Active / Registered Companies Card */}
        <div
          onClick={() => navigate('/master/subscribers')}
          className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 sm:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none flex justify-between items-start gap-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-indigo-200"
        >
          <div>
            <span className="text-[0.62rem] sm:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">
              {stats.is_filtered ? 'Companies In Range' : 'Active Companies'}
            </span>
            <h3 className="text-xl sm:text-3xl font-extrabold mt-1.5 text-slate-900 dark:text-white">
              {stats.is_filtered ? stats.total_companies : stats.active_companies}
            </h3>
            <span className="text-[10px] sm:text-xs text-indigo-500 font-semibold flex items-center gap-1 mt-2">
              <ArrowUp size={12} /> {stats.is_filtered ? `${stats.active_companies} active` : `${stats.total_companies} total`}
            </span>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-indigo-500/15 dark:bg-indigo-500/25 border border-indigo-400/30 text-indigo-600 dark:text-indigo-400 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
            <Building className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Real Interviews Conducted Card */}
        <div
          onClick={() => navigate('/master/subscribers')}
          className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 sm:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none flex justify-between items-start gap-2 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-amber-200"
        >
          <div>
            <span className="text-[0.62rem] sm:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">
              {stats.is_filtered ? 'Conducted In Range' : 'Total Conducted'}
            </span>
            <h3 className="text-xl sm:text-3xl font-extrabold mt-1.5 text-slate-900 dark:text-white">{stats.total_interviews_conducted}</h3>
            <span className="text-[10px] sm:text-xs text-amber-600 font-semibold flex items-center gap-1 mt-2">
              {stats.completed_interviews} completed
            </span>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-amber-500/15 dark:bg-amber-500/25 border border-amber-400/30 text-amber-600 dark:text-amber-400 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
            <Video className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>

        {/* Real System Health Card */}
        <div
          className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 sm:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none flex justify-between items-start gap-2"
        >
          <div>
            <span className="text-[0.62rem] sm:text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest block leading-tight">System Health</span>
            <h3 className="text-xl sm:text-3xl font-extrabold mt-1.5 text-slate-900 dark:text-white">{stats.system_health}</h3>
            <span className={`text-[10px] sm:text-xs font-semibold flex items-center gap-1 mt-2 ${stats.system_status === 'Operational' ? 'text-emerald-500' : 'text-amber-500'}`}>
              {stats.system_status} {stats.latency_ms > 0 ? `• ${stats.latency_ms}ms` : ''}
            </span>
          </div>
          <div className="w-9 h-9 sm:w-11 sm:h-11 bg-purple-500/15 dark:bg-purple-500/25 border border-purple-400/30 text-purple-600 dark:text-purple-400 rounded-lg sm:rounded-xl flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
        </div>
      </div>

      {/* Visualizations Charts Panel */}
      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              {stats.is_filtered ? 'Sales & Revenue Trend (Filtered Period in ₹)' : 'Revenue Growth (Estimated MRR in ₹)'}
            </h3>
            {stats.is_filtered && (
              <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                Filtered Range
              </span>
            )}
          </div>
          <div className="h-[280px] w-full relative">
            <canvas ref={mrrChartRef} id="mrrChart" />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none space-y-4">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">Plan Distribution</h3>
          <div className="h-[280px] w-full relative">
            <canvas ref={planDistChartRef} id="planDistChart" />
          </div>
        </div>
      </div>
    </div>
  )
}
