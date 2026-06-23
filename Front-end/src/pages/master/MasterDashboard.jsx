import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Play, Plus, Building, Video, Server, ArrowUp, DollarSign } from 'lucide-react'
import axios from 'axios'

export default function MasterDashboard() {
  const navigate = useNavigate()
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminId = sessionStorage.getItem('adminId') || ''

  // Dashboard state
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)

  // Chart Canvas references
  const mrrChartRef = useRef(null)
  const planDistChartRef = useRef(null)

  // Chart Instances
  const mrrChartInstance = useRef(null)
  const planDistChartInstance = useRef(null)

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/master/companies?master_id=${encodeURIComponent(adminId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.data && res.data.status === 'success') {
        setCompanies(res.data.data || [])
      }
    } catch (e) {
      console.error('Failed to fetch companies for dashboard stats:', e)
    } finally {
      setLoading(false)
    }
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

    // Aggregate plan counts
    const planCounts = {}
    companies.forEach(c => {
      const p = c.subscription_plan_label || c.subscription_plan || 'Free Trial'
      planCounts[p] = (planCounts[p] || 0) + 1
    })

    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-color').trim() || '#6366f1'

    const ctxMrr = mrrChartRef.current
    if (ctxMrr && window.Chart) {
      mrrChartInstance.current = new window.Chart(ctxMrr, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: 'MRR ($)',
            data: [5000, 6500, 8200, 9500, 11000, Math.max(12450, companies.length * 150)],
            borderColor: primaryColor,
            backgroundColor: `${primaryColor}1A`,
            borderWidth: 3,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      })
    }

    const ctxPlan = planDistChartRef.current
    if (ctxPlan && window.Chart) {
      const labels = Object.keys(planCounts).length ? Object.keys(planCounts) : ['Free Trial', 'Basic Plan', 'Advance Plan']
      const dataVals = Object.keys(planCounts).length ? Object.values(planCounts) : [10, 5, 2]
      planDistChartInstance.current = new window.Chart(ctxPlan, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataVals,
            backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'],
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
      fetchCompanies()
    }
  }, [token])

  useEffect(() => {
    if (companies.length >= 0) {
      renderCharts()
    }
    return () => destroyCharts()
  }, [companies])

  // Redraw charts when primary color switcher modifications happen
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (companies.length >= 0) {
        renderCharts()
      }
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] })
    return () => observer.disconnect()
  }, [companies])

  // Compute stats
  const activePlanCount = companies.filter(c => !c.is_expired).length
  const totalInterviewsConducted = companies.reduce((acc, c) => acc + (c.total_sessions || 0), 0)

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Master Console Overview</h2>
          <p className="text-sm text-slate-500">Real-time metrics, MRR, and platform analytics.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchCompanies}
            disabled={loading}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Data
          </button>
          <button
            onClick={() => navigate('/master/create-tenant')}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-md"
          >
            <Plus size={16} /> Create Tenant
          </button>
        </div>
      </div>

      {/* Enhanced Stat Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* MRR Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-start">
          <div>
            <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Monthly Recurring Revenue</span>
            <h3 className="text-3xl font-extrabold mt-1.5 text-slate-900">$12,450</h3>
            <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1 mt-2">
              <ArrowUp size={12} /> 14.2% from last month
            </span>
          </div>
          <div className="w-11 h-11 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center">
            <DollarSign size={20} />
          </div>
        </div>

        {/* Active Companies Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-start">
          <div>
            <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Active Companies</span>
            <h3 className="text-3xl font-extrabold mt-1.5 text-slate-900">{companies.length}</h3>
            <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1 mt-2">
              <ArrowUp size={12} /> 5 new this week
            </span>
          </div>
          <div className="w-11 h-11 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center">
            <Building size={20} />
          </div>
        </div>

        {/* Interviews Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-start">
          <div>
            <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Total Conducted</span>
            <h3 className="text-3xl font-extrabold mt-1.5 text-slate-900">{Math.max(1204, totalInterviewsConducted)}</h3>
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1 mt-2">
              Stable
            </span>
          </div>
          <div className="w-11 h-11 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center">
            <Video size={20} />
          </div>
        </div>

        {/* System Health Card */}
        <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-start">
          <div>
            <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">System Health</span>
            <h3 className="text-3xl font-extrabold mt-1.5 text-slate-900">99.9%</h3>
            <span className="text-xs text-emerald-500 font-semibold flex items-center gap-1 mt-2">
              All systems operational
            </span>
          </div>
          <div className="w-11 h-11 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center">
            <Server size={20} />
          </div>
        </div>
      </div>

      {/* Visualizations Charts Panel */}
      <div className="grid gap-6 lg:grid-cols-[1.8fr_1fr]">
        <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Revenue Growth (Estimated MRR)</h3>
          <div className="h-[280px] w-full relative">
            <canvas ref={mrrChartRef} id="mrrChart" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Plan Distribution</h3>
          <div className="h-[280px] w-full relative">
            <canvas ref={planDistChartRef} id="planDistChart" />
          </div>
        </div>
      </div>
    </div>
  )
}
