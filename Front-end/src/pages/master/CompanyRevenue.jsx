import React, { useState, useEffect, useMemo } from 'react'
import { useSelector } from 'react-redux'
import {
  TrendingUp,
  Search,
  Calendar,
  CreditCard,
  Building2,
  DollarSign,
  Package,
  Layers,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Download,
  RefreshCw,
  X,
  Mail,
  ChevronRight,
  ShieldCheck,
  Award,
  Sparkles,
  ArrowUpDown,
  History,
  FileText
} from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { getCompanyRevenueMaster } from '../../utils/api'

export default function CompanyRevenue() {
  const token = useSelector(state => state.auth.token) || ''
  const adminId = sessionStorage.getItem('adminId') || ''

  // Data state
  const [loading, setLoading] = useState(true)
  const [revenueData, setRevenueData] = useState({
    summary: {
      total_platform_revenue: 0,
      total_purchases_count: 0,
      total_companies_count: 0,
      paid_companies_count: 0,
      trial_companies_count: 0,
      top_contributing_company: null,
      average_revenue_per_company: 0,
      revenue_by_plan: {}
    },
    companies: []
  })

  // Filters & Controls
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [sortBy, setSortBy] = useState('revenue_desc')
  const [datePreset, setDatePreset] = useState('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Detail Modal State
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  // Fetch data
  const fetchData = async () => {
    setLoading(true)
    try {
      const params = {
        sort_by: sortBy,
      }
      if (search.trim()) params.search = search.trim()
      if (planFilter !== 'all') params.plan_filter = planFilter
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate

      const res = await getCompanyRevenueMaster(params)
      if (res && res.status === 'success') {
        setRevenueData({
          summary: res.summary || {},
          companies: res.companies || []
        })
      }
    } catch (err) {
      console.error('Failed to load company revenue analytics:', err)
      Swal.fire({
        title: 'Sync Error',
        text: typeof err === 'string' ? err : err.message || 'Failed to fetch company revenue data.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [sortBy, planFilter, startDate, endDate])

  // Handle Preset Date changes
  const handlePresetChange = (preset) => {
    setDatePreset(preset)
    const now = new Date()
    let start = ''
    let end = ''

    if (preset === 'today') {
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      start = `${yyyy}-${mm}-${dd}`
      end = `${yyyy}-${mm}-${dd}`
    } else if (preset === '7days') {
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      start = past.toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else if (preset === '30days') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      start = past.toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else if (preset === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
      start = firstDay.toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else if (preset === 'year') {
      const firstDayYear = new Date(now.getFullYear(), 0, 1)
      start = firstDayYear.toISOString().split('T')[0]
      end = now.toISOString().split('T')[0]
    } else {
      // All time
      start = ''
      end = ''
    }

    setStartDate(start)
    setEndDate(end)
  }

  const handleStartDateChange = (val) => {
    setStartDate(val)
    setDatePreset('custom')
    if (endDate && val > endDate) {
      setEndDate(val)
    }
  }

  const handleEndDateChange = (val) => {
    setDatePreset('custom')
    if (startDate && val < startDate) {
      setEndDate(startDate)
    } else {
      setEndDate(val)
    }
  }

  // Filter companies in memory for instant search responsiveness
  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return revenueData.companies
    const q = search.toLowerCase().trim()
    return revenueData.companies.filter(c =>
      c.company_name.toLowerCase().includes(q) ||
      c.admin_email.toLowerCase().includes(q) ||
      c.admin_username.toLowerCase().includes(q)
    )
  }, [revenueData.companies, search])

  const formatCurrency = (amt) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amt || 0)
  }

  const formatDate = (isoStr) => {
    if (!isoStr) return '—'
    try {
      const d = new Date(isoStr)
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return isoStr
    }
  }

  // Export to CSV
  const handleExportCSV = () => {
    if (!filteredCompanies.length) {
      Swal.fire({
        title: 'No Data',
        text: 'There is no revenue data to export.',
        icon: 'info',
        background: '#161c2d',
        color: '#fff'
      })
      return
    }

    const headers = [
      'Company Name',
      'Admin Email',
      'Registered Date',
      'Current Plan',
      'Plan Price (INR)',
      'Previous Plans Count',
      'Total Purchases Count',
      'Total Revenue (INR)',
      'Last Payment Date'
    ]

    const rows = filteredCompanies.map(c => [
      `"${c.company_name.replace(/"/g, '""')}"`,
      `"${c.admin_email}"`,
      `"${formatDate(c.created_at)}"`,
      `"${c.current_plan?.label || 'Free Trial'}"`,
      c.current_plan?.price || 0,
      c.previous_plans?.length || 0,
      c.total_purchases_count || 0,
      c.total_revenue || 0,
      `"${formatDate(c.last_payment_date)}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `company_revenue_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const getPlanBadge = (planKey, label) => {
    const p = (planKey || '').toLowerCase()
    if (p.includes('advance')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <Sparkles size={11} className="text-purple-600" />
          {label || 'Advance Plan'}
        </span>
      )
    }
    if (p.includes('basic')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <Package size={11} className="text-blue-600" />
          {label || 'Basic Plan'}
        </span>
      )
    }
    if (p.includes('owner')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Award size={11} className="text-amber-600" />
          {label || 'Owner Plan'}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        <Clock size={11} className="text-slate-500 dark:text-slate-400" />
        {label || 'Free Trial'}
      </span>
    )
  }

  const openCompanyDetail = (comp) => {
    setSelectedCompany(comp)
    setIsDetailModalOpen(true)
  }

  const totalPlatformRev = revenueData.summary.total_platform_revenue || 1

  return (
    <div className="space-y-6 pb-12">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
              <TrendingUp size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                Company-Wise Revenue Analytics
                <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                  Live Billing
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Comprehensive tracking of client plans, purchase count, previous plans taken, and lifetime revenue.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200/80 rounded-lg transition"
            title="Refresh Revenue"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : ''} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm shadow-indigo-200 transition"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* ── Top Platform Metrics ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total Platform Revenue */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-indigo-950 text-white p-5 rounded-2xl shadow-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none" />
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-indigo-200 tracking-wide uppercase">Total Revenue</span>
            <div className="p-1.5 bg-white dark:bg-slate-800/60/10 rounded-lg text-indigo-200">
              <DollarSign size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black tracking-tight text-white">
              {formatCurrency(revenueData.summary.total_platform_revenue)}
            </div>
            <div className="flex items-center gap-1 text-[11px] text-indigo-300 mt-1 font-medium">
              <ArrowUpRight size={13} className="text-emerald-400" />
              <span>Platform Lifetime Sales</span>
            </div>
          </div>
        </div>

        {/* Top Contributing Client */}
        <div className="bg-white dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide uppercase">Top Client</span>
            <div className="p-2 bg-amber-500/15 dark:bg-amber-500/25 border border-amber-400/30 text-amber-600 dark:text-amber-400 rounded-xl">
              <Award size={16} />
            </div>
          </div>
          <div>
            <div className="text-base font-bold text-slate-900 dark:text-white truncate" title={revenueData.summary.top_contributing_company?.name || 'None'}>
              {revenueData.summary.top_contributing_company?.name || 'No Paid Client Yet'}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              <span className="text-emerald-600 font-semibold">
                {revenueData.summary.top_contributing_company ? formatCurrency(revenueData.summary.top_contributing_company.revenue) : '₹0'}
              </span>
              <span className="text-slate-400 font-medium">
                {revenueData.summary.top_contributing_company?.plan || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Total Purchases Count */}
        <div className="bg-white dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide uppercase">Total Purchases</span>
            <div className="p-2 bg-purple-500/15 dark:bg-purple-500/25 border border-purple-400/30 text-purple-600 dark:text-purple-400 rounded-xl">
              <CreditCard size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {revenueData.summary.total_purchases_count || 0}
              <span className="text-xs font-normal text-slate-400 ml-1.5">orders</span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Across all tenant companies
            </div>
          </div>
        </div>

        {/* Paying vs Trial Companies */}
        <div className="bg-white dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide uppercase">Paid vs Trial</span>
            <div className="p-2 bg-emerald-500/15 dark:bg-emerald-500/25 border border-emerald-400/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <Building2 size={16} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-600">{revenueData.summary.paid_companies_count || 0}</span>
              <span className="text-xs text-slate-400 font-medium">paid</span>
              <span className="text-slate-300 font-normal">/</span>
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{revenueData.summary.trial_companies_count || 0}</span>
              <span className="text-xs text-slate-400 font-medium">trials</span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800/50 rounded-full h-1.5 mt-2 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-1.5 rounded-full"
                style={{
                  width: `${((revenueData.summary.paid_companies_count || 0) / (revenueData.summary.total_companies_count || 1)) * 100}%`
                }}
              />
            </div>
          </div>
        </div>

        {/* Average Revenue Per Company (ARPU) */}
        <div className="bg-white dark:bg-slate-800/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tracking-wide uppercase">Avg Rev / Tenant</span>
            <div className="p-2 bg-blue-500/15 dark:bg-blue-500/25 border border-blue-400/30 text-blue-600 dark:text-blue-400 rounded-xl">
              <Layers size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(revenueData.summary.average_revenue_per_company)}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              ARPU across {revenueData.summary.total_companies_count || 0} accounts
            </div>
          </div>
        </div>
      </div>

      {/* ── Date Filters & Search Bar ───────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm space-y-3">
        {/* Date Presets Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
              <Calendar size={13} />
              Date Filter:
            </span>
            {[
              { key: 'all', label: 'All Time' },
              { key: 'today', label: 'Today' },
              { key: '7days', label: 'Last 7 Days' },
              { key: '30days', label: 'Last 30 Days' },
              { key: 'month', label: 'This Month' },
              { key: 'year', label: 'This Year' },
            ].map(p => {
              const isActive = datePreset === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => handlePresetChange(p.key)}
                  style={isActive ? { backgroundColor: '#4f46e5', color: '#ffffff', borderColor: '#4338ca' } : {}}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all border ${isActive
                    ? 'shadow-md shadow-indigo-500/30 ring-2 ring-indigo-400'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="text-slate-400 font-medium">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value)
                  setDatePreset('custom')
                }}
                className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200"
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
              <span className="text-slate-400 font-medium">To:</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => {
                  setEndDate(e.target.value)
                  setDatePreset('custom')
                }}
                className="px-2.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-slate-50 dark:bg-slate-900/50 text-slate-700 dark:text-slate-200"
              />
            </div>
            {(startDate || endDate) && (
              <button
                onClick={() => handlePresetChange('all')}
                className="p-1 text-slate-400 hover:text-red-500 transition"
                title="Clear date filter"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Search, Plan Filter, & Sort Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search company or admin email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition placeholder:text-slate-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-400"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
            {/* Plan Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Plan:</span>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 font-medium"
              >
                <option value="all">All Plans</option>
                <option value="advance">Advance Plan</option>
                <option value="basic">Basic Plan</option>
                <option value="trial">Free Trial</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Sort By:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-slate-200 font-medium"
              >
                <option value="revenue_desc">Highest Revenue (₹)</option>
                <option value="revenue_asc">Lowest Revenue (₹)</option>
                <option value="orders_desc">Most Purchases</option>
                <option value="date_desc">Newest Joined</option>
                <option value="name_asc">Company Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Company Revenue Table ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">Companies Breakdown</h2>
            <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-full font-medium">
              {filteredCompanies.length} {filteredCompanies.length === 1 ? 'client' : 'clients'}
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Click on any company row to view full payment audit & previous plans history
          </span>
        </div>

        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <RefreshCw size={28} className="animate-spin text-indigo-600" />
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Calculating company billing and subscription histories...</p>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="py-16 text-center">
            <Building2 size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No companies found</p>
            <p className="text-xs text-slate-400 mt-0.5">Try clearing your search or date filter parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50/75 border-b border-slate-200 dark:border-slate-700/80 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-6">Company & Admin</th>
                  <th className="py-3 px-4">Current Plan</th>
                  <th className="py-3 px-4">Previous Plans Taken</th>
                  <th className="py-3 px-4 text-center">Purchases Count</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                  <th className="py-3 px-4">Last Payment Date</th>
                  <th className="py-3 px-6 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCompanies.map((comp) => {
                  const initials = (comp.company_name || 'C')
                    .split(' ')
                    .map(w => w[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase()

                  const revShare = Math.min(100, Math.round((comp.total_revenue / totalPlatformRev) * 100))

                  return (
                    <tr
                      key={comp.id}
                      onClick={() => openCompanyDetail(comp)}
                      className="hover:bg-indigo-50/40 transition cursor-pointer group"
                    >
                      {/* Company & Admin */}
                      <td className="py-3.5 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white font-bold flex items-center justify-center text-xs shadow-sm shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]" title={comp.company_name}>
                              {comp.company_name}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {comp.admin_email || comp.admin_username || 'No email'}
                            </div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              Joined {formatDate(comp.created_at)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current Plan */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div>{getPlanBadge(comp.current_plan?.key, comp.current_plan?.label)}</div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {comp.current_plan?.price > 0 ? (
                              <span>{formatCurrency(comp.current_plan.price)}/mo</span>
                            ) : (
                              <span className="text-slate-400">₹0 / Free</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {comp.current_plan?.credits} credits balance
                          </div>
                        </div>
                      </td>

                      {/* Previous Plans Taken */}
                      <td className="py-3.5 px-4">
                        {comp.previous_plans && comp.previous_plans.length > 0 ? (
                          <div className="flex flex-col gap-1 max-w-[180px]">
                            {comp.previous_plans.slice(0, 2).map((pp, idx) => (
                              <div key={idx} className="flex items-center gap-1 text-[11px]">
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-md font-medium text-[10px] border border-slate-200 dark:border-slate-700">
                                  {pp.plan_label}
                                </span>
                                <span className="text-slate-400 text-[10px]">
                                  {pp.price > 0 ? formatCurrency(pp.price) : 'Free'}
                                </span>
                              </div>
                            ))}
                            {comp.previous_plans.length > 2 && (
                              <span className="text-[10px] text-indigo-600 font-medium">
                                +{comp.previous_plans.length - 2} more past plans
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">No prior plans</span>
                        )}
                      </td>

                      {/* Total Purchases Count */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${comp.total_purchases_count > 0
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400'
                          }`}>
                          {comp.total_purchases_count} {comp.total_purchases_count === 1 ? 'order' : 'orders'}
                        </span>
                      </td>

                      {/* Total Revenue */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="font-bold text-slate-900 dark:text-white text-sm">
                          {formatCurrency(comp.total_revenue)}
                        </div>
                        {comp.total_revenue > 0 && (
                          <div className="text-[10px] text-emerald-600 font-medium flex items-center justify-end gap-0.5">
                            <span>{revShare}% of platform</span>
                          </div>
                        )}
                      </td>

                      {/* Last Payment Date */}
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400 text-xs">
                        <div>{formatDate(comp.last_payment_date)}</div>
                        <div className="text-[10px] text-slate-400">
                          {comp.transactions?.[0]?.order_id || 'Active Account'}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-6 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openCompanyDetail(comp)
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100/80 rounded-lg transition"
                        >
                          <FileText size={13} />
                          Details
                          <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Detailed Company Modal / Drawer ─────────────────────────────── */}
      {isDetailModalOpen && selectedCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-800/60 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-800 text-white font-bold text-base flex items-center justify-center shadow-md">
                  {(selectedCompany.company_name || 'C').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    {selectedCompany.company_name}
                    {getPlanBadge(selectedCompany.current_plan?.key, selectedCompany.current_plan?.label)}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>Admin: {selectedCompany.admin_email || selectedCompany.admin_username}</span>
                    <span>•</span>
                    <span>Client ID: {selectedCompany.id.slice(-8).toUpperCase()}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Financial Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-indigo-500/10 dark:bg-indigo-500/20 border border-indigo-200 dark:border-indigo-500/30">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                    Lifetime Revenue (LTV)
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {formatCurrency(selectedCompany.total_revenue)}
                  </div>
                  <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 mt-0.5">
                    {selectedCompany.total_purchases_count} verified orders completed
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-purple-500/10 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30">
                  <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                    Current Active Plan
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {selectedCompany.current_plan?.label || 'Free Trial'}
                  </div>
                  <div className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 mt-0.5">
                    {selectedCompany.current_plan?.price > 0 ? `${formatCurrency(selectedCompany.current_plan.price)} / billing cycle` : 'Complimentary Tier'}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30">
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                    Usage & Sessions
                  </div>
                  <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                    {selectedCompany.sessions_stats?.completed || 0}
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 ml-1">completed</span>
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 mt-0.5">
                    {selectedCompany.current_plan?.credits || 0} credits balance remaining
                  </div>
                </div>
              </div>

              {/* Previous Plans Timeline */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <History size={14} className="text-indigo-600" />
                  Plans Progression & Change History
                </h4>

                {selectedCompany.previous_plans && selectedCompany.previous_plans.length > 0 ? (
                  <div className="space-y-3">
                    {selectedCompany.previous_plans.map((pp, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/80 text-xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span>{pp.plan_label}</span>
                              <span className="text-slate-400 font-normal">→ upgraded to</span>
                              <span className="text-indigo-600 font-medium">{pp.replaced_by}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              Changed on {formatDate(pp.changed_at)} • Modified by {pp.changed_by}
                            </div>
                          </div>
                        </div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200">
                          {pp.price > 0 ? formatCurrency(pp.price) : '₹0'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/70 text-center text-xs text-slate-400">
                    No plan changes recorded. Client started on {selectedCompany.current_plan?.label || 'Free Trial'}.
                  </div>
                )}
              </div>

              {/* Transactions Ledger */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <CreditCard size={14} className="text-emerald-600" />
                  Order & Transaction Invoices ({selectedCompany.transactions?.length || 0})
                </h4>

                {selectedCompany.transactions && selectedCompany.transactions.length > 0 ? (
                  <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800/50 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          <th className="py-2.5 px-4">Order ID</th>
                          <th className="py-2.5 px-4">Payment Ref</th>
                          <th className="py-2.5 px-4">Plan / Purpose</th>
                          <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                          <th className="py-2.5 px-4 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedCompany.transactions.map((tx, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700/80">
                            <td className="py-2.5 px-4 font-mono font-medium text-slate-900 dark:text-white">
                              {tx.order_id}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                              {tx.payment_id}
                            </td>
                            <td className="py-2.5 px-4 font-medium text-slate-800 dark:text-slate-100">
                              {tx.plan_name}
                              <span className="block text-[10px] text-slate-400">{tx.type}</span>
                            </td>
                            <td className="py-2.5 px-4 text-right font-bold text-slate-900 dark:text-white">
                              {formatCurrency(tx.amount)}
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 size={10} />
                                {tx.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-500 dark:text-slate-400 text-[11px]">
                              {formatDate(tx.date)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700/70 text-center text-xs text-slate-400">
                    No payment orders logged for this tenant account.
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Total Orders: {selectedCompany.total_purchases_count} • Lifetime Value: {formatCurrency(selectedCompany.total_revenue)}
              </span>
              <div className="flex items-center gap-2">
                {selectedCompany.admin_email && (
                  <a
                    href={`mailto:${selectedCompany.admin_email}?subject=HireIQ%20Account%20Update`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                  >
                    <Mail size={13} />
                    Email Client
                  </a>
                )}
                <button
                  onClick={() => setIsDetailModalOpen(false)}
                  style={{ backgroundColor: '#4f46e5', color: '#ffffff', borderColor: '#4338ca' }}
                  className="px-5 py-2 text-xs font-extrabold rounded-xl border transition-all shadow-md shadow-indigo-500/30 hover:opacity-90 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
