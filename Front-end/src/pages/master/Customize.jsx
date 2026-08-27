import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/api";
import Swal from "sweetalert2";
import { 
  Search, 
  Filter, 
  Calendar, 
  Mail, 
  Clock, 
  Activity, 
  Sparkles, 
  ShieldAlert, 
  User, 
  ArrowRight,
  Database,
  RefreshCw,
  Crown,
  Users,
  Sliders,
  Upload
} from "lucide-react";

const Customize = () => {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second for the live countdown
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fileInputRef = React.useRef(null);
  const [selectedAdminForLogo, setSelectedAdminForLogo] = useState(null);

  const handleLogoClick = (e, admin) => {
    e.stopPropagation();
    setSelectedAdminForLogo(admin);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedAdminForLogo) return;

    if (file.size > 200 * 1024) {
      Swal.fire({ icon: "error", title: "Error", text: "Logo must be less than 200KB" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      setSelectedAdminForLogo(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const admin = selectedAdminForLogo;
        const currentLayoutConfig = admin.layout_config || {
          primary_color: "#4f46e5",
          sidebar_bg_color: "#ffffff",
          layout_type: "sidebar"
        };
        const updatedLayoutConfig = { 
          ...currentLayoutConfig, 
          favicon: reader.result,
          navbar_logo: reader.result 
        };

        await api.put(`/master/companies/${admin.id}`, {
          subscription_plan: admin.plan || "trial",
          add_days: 0,
          add_credits: 0,
          features: admin.features || [],
          layout_config: updatedLayoutConfig
        });

        Swal.fire({ icon: "success", title: "Success", text: "Sidebar logo updated!", timer: 1500, showConfirmButton: false });
        fetchData();
      } catch (err) {
        Swal.fire({ icon: "error", title: "Error", text: "Failed to update logo." });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setSelectedAdminForLogo(null);
      }
    };
    reader.readAsDataURL(file);
  };

  // Fetch all admins and plans
  const fetchData = async () => {
    try {
      setLoading(true);
      const [adminsRes, plansRes] = await Promise.all([
        api.get("/master/companies"),
        api.get("/master/plans").catch(() => ({ data: [] }))
      ]);

      const rawPlans = plansRes.data?.data || plansRes.data || [];
      setPlans(rawPlans);
      
      const allFeaturesRaw = new Set();
      const planFeaturesMap = {};
      rawPlans.forEach(p => {
        const pName = p.plan_key || p.plan_name || p.planName || "trial";
        planFeaturesMap[pName.toLowerCase()] = p.features || [];
        if (p.features && Array.isArray(p.features)) {
          p.features.forEach(f => allFeaturesRaw.add(f));
        }
      });
      const allFeatures = Array.from(allFeaturesRaw);

      const rawAdmins = adminsRes.data?.data || [];
      const mappedAdmins = rawAdmins.map(admin => ({
        ...admin,
        id: admin.id,
        companyName: admin.company_name,
        name: admin.username,
        email: admin.email,
        plan: admin.subscription_plan,
        planExpiresAt: admin.subscription_expiry,
        planActivatedAt: admin.subscription_start,
        features: admin.features || [], // capture explicit features
        layout_config: admin.layout_config || null,
        allFeatures, // pass this to CustomizingAdmin easily
        planFeaturesMap
      }));
      setAdmins(mappedAdmins);
      setError(null);
    } catch (err) {
      console.error("Fetch error:", err);
      setError("Failed to fetch dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper: Get Time Remaining
  const getTimeRemaining = (expiryDate) => {
    if (!expiryDate) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const total = Date.parse(expiryDate) - Date.parse(currentTime);
    if (total <= 0) return { total: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const days = Math.floor(total / (1000 * 60 * 60 * 24));

    return { total, days, hours, minutes, seconds };
  };

  // Filtered admins
  const filteredAdmins = admins.filter((admin) => {
    const matchesSearch = 
      admin.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      admin.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      admin.email?.toLowerCase().includes(searchTerm.toLowerCase());

    const isExpired = admin.planExpiresAt ? new Date(admin.planExpiresAt) <= currentTime : true;
    const matchesStatus = 
      statusFilter === "all" ||
      (statusFilter === "active" && !isExpired) ||
      (statusFilter === "expired" && isExpired);

    const matchesPlan = 
      planFilter === "all" || 
      admin.plan?.toLowerCase() === planFilter.toLowerCase();

    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Calculate statistics
  const totalSubscribers = admins.length;
  const activeSubs = admins.filter((a) => a.planExpiresAt && new Date(a.planExpiresAt) > currentTime).length;
  const premiumSubs = admins.filter((a) => a.plan?.toLowerCase() === "premium").length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-2 border-slate-200 dark:border-slate-700"></div>
          <div className="absolute inset-0 rounded-full border-2 border-slate-900 border-t-transparent animate-spin"></div>
        </div>
        <p className="mt-5 text-slate-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">Synchronizing Subscribers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.35s_ease-out] max-w-7xl mx-auto">
      
      {/* Hidden File Input for Logo Upload */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept="image/png,image/jpeg,image/webp,image/x-icon" 
        onChange={handleLogoUpload} 
      />

      {/* Page Title & Meta Info */}
      <div className="flex justify-between items-center pb-1">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Sliders className="w-4.5 h-4.5 text-slate-800 dark:text-slate-100" />
            Customization Hub
          </h2>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Configure system configurations, custom modules, and user seat limits for active subscriber tenants.
          </p>
        </div>
      </div>

      {/* Stats Dashboard - Colorful Accented Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Subscribers */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all duration-300">
          <div>
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Total Enrolled</span>
            <span className="text-xl font-bold text-foreground mt-1 block">{totalSubscribers}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 shadow-sm">
            <Users className="w-5 h-5 text-indigo-400" />
          </div>
        </div>

        {/* Active Subscriptions */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all duration-300">
          <div>
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block">Active Plans</span>
            <span className="text-xl font-bold text-foreground mt-1 block">{activeSubs}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
            <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>
        </div>

        {/* Premium Plan Subscribers */}
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm transition-all duration-300">
          <div>
            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block">Premium Tier</span>
            <span className="text-xl font-bold text-foreground mt-1 block">{premiumSubs}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <Crown className="w-5 h-5 text-amber-400" />
          </div>
        </div>
      </div>

      {/* Filter and Search Panel - Vercel Inline Style */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pt-1">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search organizations..."
            className="w-full pl-10 pr-4 py-2.5 text-xs font-semibold bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900/10 transition-colors shadow-sm"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
          <div className="relative">
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 pl-3.5 pr-8 py-2.5 rounded-xl outline-none cursor-pointer hover:border-slate-350 transition-colors shadow-sm appearance-none"
            >
              <option value="all">All Plans</option>
              {plans.map((plan) => {
                const pName = plan.planName || plan.plan_name || plan.plan_key || "Unknown Plan";
                return (
                  <option key={plan._id || plan.id || pName} value={pName.toLowerCase()}>
                    {pName}
                  </option>
                );
              })}
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 pl-3.5 pr-8 py-2.5 rounded-xl outline-none cursor-pointer hover:border-slate-350 transition-colors shadow-sm appearance-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Plans</option>
              <option value="expired">Expired Plans</option>
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-black text-white px-4.5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow active:scale-97 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-xs font-semibold flex items-center gap-2 animate-[fadeIn_0.3s_ease-out]">
          <ShieldAlert className="w-4.5 h-4.5 text-rose-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredAdmins.map((admin) => {
          const time = getTimeRemaining(admin.planExpiresAt);
          const isExpired = admin.planExpiresAt ? new Date(admin.planExpiresAt) <= currentTime : true;

          const isPremium = admin.plan?.toLowerCase() === "premium";
          const isOwner = admin.plan?.toLowerCase() === "owner";

          let badgeStyle = "bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/30 font-bold";
          let avatarStyle = "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-indigo-400/30 shadow-md shadow-indigo-500/25";

          if (isPremium) {
            badgeStyle = "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 font-bold";
            avatarStyle = "bg-gradient-to-br from-amber-500 to-amber-600 text-white border-amber-400/30 shadow-md shadow-amber-500/25";
          } else if (isOwner) {
            badgeStyle = "bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-500/30 font-bold";
            avatarStyle = "bg-gradient-to-br from-purple-500 to-purple-600 text-white border-purple-400/30 shadow-md shadow-purple-500/25";
          } else {
            badgeStyle = "bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-500/30 font-bold";
            avatarStyle = "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white border-indigo-400/30 shadow-md shadow-indigo-500/25";
          }

          return (
            <div
              key={admin._id || admin.id}
              onClick={() => navigate(`/master/customizing-admin/${admin._id || admin.id}`, { state: { admin } })}
              className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:border-slate-400 hover:shadow-md cursor-pointer transition-all duration-300 flex flex-col justify-between overflow-hidden group hover:-translate-y-1"
            >
              {/* Card Content Wrapper */}
              <div className="space-y-5 flex-1">
                
                {/* Header row: Company logo & plan name & status */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl border flex items-center justify-center font-black text-sm text-white shrink-0 shadow-md transition-all duration-300 ${avatarStyle}`}>
                      {admin.companyName ? admin.companyName.charAt(0).toUpperCase() : admin.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-black transition-colors text-sm tracking-tight truncate pr-1">
                        {admin.companyName || admin.name}
                      </h4>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${badgeStyle}`}>
                          {admin.plan}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge & Logo Upload */}
                  <div className="shrink-0 flex flex-col items-end gap-2">
                    {isExpired ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-500/[0.04] text-rose-700 text-[10px] font-bold rounded-lg border border-rose-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                        Expired
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/[0.04] text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Active
                      </span>
                    )}
                    <button 
                      onClick={(e) => handleLogoClick(e, admin)}
                      className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 dark:text-slate-400 hover:text-indigo-600 bg-slate-50 dark:bg-slate-900/50 hover:bg-indigo-50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-indigo-200 transition-colors"
                      title="Upload Sidebar Logo"
                    >
                      <Upload className="w-3 h-3" />
                      Logo
                    </button>
                  </div>
                </div>

                {/* Details list inside a premium soft bg section */}
                <div className="bg-slate-50 dark:bg-slate-900/50/50 rounded-xl p-3 border border-slate-100 dark:border-slate-800 space-y-2.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" /> Email
                    </span>
                    <span className="text-slate-700 dark:text-slate-200 font-bold truncate max-w-[150px] font-mono text-[10px]" title={admin.email}>
                      {admin.email}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 font-semibold flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" /> Seat Cap
                    </span>
                    <span className="text-slate-800 dark:text-slate-100 font-bold">
                      {admin.plan?.toLowerCase().includes("owner") ? "Unlimited" : `${admin.userLimit || "30"} limit`}
                    </span>
                  </div>
                </div>

                {/* Dates Section with elegant line hierarchy */}
                <div className="grid grid-cols-2 gap-4 text-[9px] uppercase font-bold tracking-wider text-slate-400">
                  <div className="space-y-1">
                    <span className="font-semibold block opacity-80">Activated</span>
                    <span className="text-slate-700 dark:text-slate-200 font-mono text-xs block font-bold">
                      {admin.planActivatedAt ? new Date(admin.planActivatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </span>
                  </div>
                  <div className="space-y-1 border-l border-slate-200 dark:border-slate-700 pl-4">
                    <span className="font-semibold block opacity-80">Expires</span>
                    <span className="text-slate-700 dark:text-slate-200 font-mono text-xs block font-bold">
                      {admin.planExpiresAt ? new Date(admin.planExpiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </span>
                  </div>
                </div>

              </div>

              {/* Card Footer - Countdown (if active) */}
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Time Left</span>
                {isExpired ? (
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider">Renewal Required</span>
                ) : (
                  <div className="flex items-center gap-1 font-mono text-[10px] font-bold">
                    <span className="text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm">{time.days}d</span>
                    <span className="text-slate-300">:</span>
                    <span className="text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm">{String(time.hours).padStart(2, "0")}h</span>
                    <span className="text-slate-300">:</span>
                    <span className="text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm">{String(time.minutes).padStart(2, "0")}m</span>
                    <span className="text-slate-300">:</span>
                    <span className="text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded shadow-sm animate-pulse">{String(time.seconds).padStart(2, "0")}s</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAdmins.length === 0 && (
        <div className="flex flex-col items-center justify-center p-16 bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60 text-center shadow-sm">
          <Database className="w-10 h-10 text-slate-350 mb-3" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">No Subscriber Records Found</h4>
          <p className="text-slate-400 max-w-sm mt-1 text-xs font-semibold">
            Try adjusting your search query, selecting different plan filters, or syncing the database again.
          </p>
        </div>
      )}
    </div>
  );
};

export default Customize;
