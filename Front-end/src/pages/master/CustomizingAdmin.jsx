import React, { useState, useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../utils/api";
import { ArrowLeft, Save, User, Shield, CreditCard, Clock, Palette, Image as ImageIcon, Loader2 } from "lucide-react";

const CustomizingAdmin = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [admin, setAdmin] = useState(location.state?.admin || null);
  const [fetchingAdmin, setFetchingAdmin] = useState(!location.state?.admin);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    subscription_plan: location.state?.admin?.plan || "trial",
    add_days: 0,
    add_credits: 0
  });

  const [allFeatures, setAllFeatures] = useState(location.state?.admin?.allFeatures || []);
  const [planFeaturesMap, setPlanFeaturesMap] = useState(location.state?.admin?.planFeaturesMap || {});
  const [selectedFeatures, setSelectedFeatures] = useState(
    location.state?.admin?.features && location.state.admin.features.length > 0
      ? location.state.admin.features
      : (location.state?.admin?.planFeaturesMap?.[location.state?.admin?.plan?.toLowerCase() || "trial"] || [])
  );

  const [layoutConfig, setLayoutConfig] = useState(location.state?.admin?.layout_config || {
    primary_color: "#4f46e5",
    sidebar_bg_color: "#ffffff",
    favicon: "",
    layout_type: "sidebar"
  });

  // Fallback fetch if page was loaded directly or refreshed
  useEffect(() => {
    if (!admin && id) {
      const fetchDetails = async () => {
        setFetchingAdmin(true);
        try {
          const [subRes, plansRes] = await Promise.all([
            api.get(`/master/subscriptions/${id}`).catch(() => null),
            api.get(`/master/plans`).catch(() => ({ data: [] }))
          ]);

          const rawPlans = plansRes?.data || [];
          const allFeaturesRaw = new Set();
          const pMap = {};
          rawPlans.forEach(p => {
            const pName = p.plan_key || p.plan_name || p.planName || "trial";
            pMap[pName.toLowerCase()] = p.features || [];
            if (p.features && Array.isArray(p.features)) {
              p.features.forEach(f => allFeaturesRaw.add(f));
            }
          });
          const allF = Array.from(allFeaturesRaw);
          setAllFeatures(allF);
          setPlanFeaturesMap(pMap);

          if (subRes && subRes.data) {
            const d = subRes.data;
            const fetchedAdmin = {
              id: d.company_id || id,
              companyName: d.company_name,
              name: d.primary_username || d.owner_name,
              email: d.primary_email,
              plan: d.plan_key || "trial",
              features: d.features || d.plan_features || [],
              layout_config: d.layout_config || {
                primary_color: "#4f46e5",
                sidebar_bg_color: "#ffffff",
                favicon: "",
                layout_type: "sidebar"
              }
            };
            setAdmin(fetchedAdmin);
            setFormData({
              subscription_plan: fetchedAdmin.plan || "trial",
              add_days: 0,
              add_credits: 0
            });
            setSelectedFeatures(
              fetchedAdmin.features && fetchedAdmin.features.length > 0
                ? fetchedAdmin.features
                : (pMap[fetchedAdmin.plan?.toLowerCase() || "trial"] || [])
            );
            if (fetchedAdmin.layout_config) {
              setLayoutConfig(fetchedAdmin.layout_config);
            }
          } else {
            setError("Could not load organization details.");
          }
        } catch (e) {
          console.error("Error fetching company details:", e);
          setError("Failed to load organization details.");
        } finally {
          setFetchingAdmin(false);
        }
      };

      fetchDetails();
    }
  }, [id, admin]);

  if (fetchingAdmin) {
    return (
      <div className="p-16 flex flex-col items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading organization configuration...</p>
      </div>
    );
  }

  if (!admin) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-4">No organization details found.</p>
        <button 
          onClick={() => navigate(-1)}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  const allFeatures = admin?.allFeatures || [];
  const planFeaturesMap = admin?.planFeaturesMap || {};
  const initialFeatures = admin?.features && admin.features.length > 0 
    ? admin.features 
    : (planFeaturesMap[admin?.plan?.toLowerCase() || "trial"] || []);

  const [selectedFeatures, setSelectedFeatures] = useState(initialFeatures);

  const [layoutConfig, setLayoutConfig] = useState(admin?.layout_config || {
    primary_color: "#4f46e5",
    sidebar_bg_color: "#ffffff",
    favicon: "",
    navbar_logo: "",
    layout_type: "sidebar"
  });

  const handleLayoutChange = (e) => {
    const { name, value } = e.target;
    setLayoutConfig(prev => ({ ...prev, [name]: value }));
  };

  const handleFaviconUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 200 * 1024) {
        setError("Favicon must be less than 200KB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLayoutConfig(prev => ({ ...prev, favicon: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleNavbarLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 200 * 1024) {
        setError("Navbar logo must be less than 200KB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLayoutConfig(prev => ({ ...prev, navbar_logo: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "subscription_plan") {
      setSelectedFeatures(planFeaturesMap[value.toLowerCase()] || []);
    }
    setFormData(prev => ({
      ...prev,
      [name]: name === "add_days" || name === "add_credits" ? parseInt(value) || 0 : value
    }));
  };

  const handleFeatureToggle = (feature) => {
    setSelectedFeatures(prev => 
      prev.includes(feature)
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await api.put(`/master/companies/${id}`, {
        ...formData,
        features: selectedFeatures,
        layout_config: layoutConfig
      });
      setSuccess(true);
    } catch (err) {
      console.error(err);
      setError("Failed to update tenant configuration.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto animate-[fadeIn_0.3s_ease-out]">
      <button 
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors mb-6 text-sm font-semibold"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Customization Hub
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <User className="w-6 h-6 text-indigo-600" />
          Modify Organization: {admin.companyName}
        </h1>
        <p className="text-sm text-slate-500 mt-2 font-medium">Update subscription tiers, extend active periods, and allocate AI credits.</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-800 rounded-xl text-sm font-semibold flex items-center gap-3">
          <Shield className="w-5 h-5 text-rose-500" />
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-sm font-semibold flex items-center gap-3">
          <Shield className="w-5 h-5 text-emerald-500" />
          Tenant configuration updated successfully!
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Subscription Plan */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Shield className="w-4 h-4 text-slate-400" /> Subscription Plan
            </label>
            <select
              name="subscription_plan"
              value={formData.subscription_plan}
              onChange={handleChange}
              className="w-full bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            >
              <option value="trial">Trial</option>
              <option value="basic">Basic</option>
              <option value="premium">Premium</option>
              <option value="owner">Owner</option>
              <option value="advance">Advance</option>
            </select>
            <p className="text-[10px] text-slate-400 font-medium">Changing the plan replaces the current active plan.</p>
          </div>

          {/* Add Days */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Clock className="w-4 h-4 text-slate-400" /> Extend Expiry (Days)
            </label>
            <input
              type="number"
              name="add_days"
              value={formData.add_days}
              onChange={handleChange}
              min="0"
              className="w-full bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
            <p className="text-[10px] text-slate-400 font-medium">Adds the specified number of days to the current expiry date.</p>
          </div>

          {/* Add Credits */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <CreditCard className="w-4 h-4 text-slate-400" /> Add Credits
            </label>
            <input
              type="number"
              name="add_credits"
              value={formData.add_credits}
              onChange={handleChange}
              min="0"
              className="w-full bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 px-4 py-3 rounded-xl focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
            <p className="text-[10px] text-slate-400 font-medium">Additional AI or calling credits for the tenant.</p>
          </div>
        </div>

        {/* Custom Features */}
        {allFeatures.length > 0 && (
          <div className="space-y-3 mt-8">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
              <Shield className="w-4 h-4 text-slate-400" /> Module Access
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              {allFeatures.map(feature => (
                <label key={feature} className="flex items-center gap-3 cursor-pointer p-2 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedFeatures.includes(feature)}
                    onChange={() => handleFeatureToggle(feature)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-700 capitalize">{feature.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 font-medium">Select specific modules to grant or revoke access to this tenant. Modifying these will override default plan settings.</p>
          </div>
        )}

        {/* Branding & Layout Config */}
        <div className="space-y-4 mt-8 pt-6 border-t border-slate-100">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
            <Palette className="w-5 h-5 text-indigo-500" /> Branding & Layout Settings
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Primary Accent Color</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  name="primary_color"
                  value={layoutConfig.primary_color || "#4f46e5"} 
                  onChange={handleLayoutChange}
                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                />
                <input 
                  type="text" 
                  name="primary_color"
                  value={layoutConfig.primary_color || "#4f46e5"} 
                  onChange={handleLayoutChange}
                  className="bg-white border border-slate-200 text-sm font-semibold text-slate-800 px-3 py-2 rounded-lg flex-1 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Controls buttons, active states, and gradients.</p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Sidebar Background</label>
              <div className="flex items-center gap-3">
                <input 
                  type="color" 
                  name="sidebar_bg_color"
                  value={layoutConfig.sidebar_bg_color || "#ffffff"} 
                  onChange={handleLayoutChange}
                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent p-0"
                />
                <input 
                  type="text" 
                  name="sidebar_bg_color"
                  value={layoutConfig.sidebar_bg_color || "#ffffff"} 
                  onChange={handleLayoutChange}
                  className="bg-white border border-slate-200 text-sm font-semibold text-slate-800 px-3 py-2 rounded-lg flex-1 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Main background color for the tenant's sidebar.</p>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Layout Style</label>
              <div className="flex items-center gap-4 bg-white p-2 rounded-lg border border-slate-200">
                <label className="flex-1 flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded transition-colors">
                  <input
                    type="radio"
                    name="layout_type"
                    value="sidebar"
                    checked={!layoutConfig.layout_type || layoutConfig.layout_type === "sidebar"}
                    onChange={handleLayoutChange}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span className="text-sm font-semibold text-slate-700">Sidebar (Vertical)</span>
                </label>
                <div className="w-px h-8 bg-slate-200"></div>
                <label className="flex-1 flex items-center gap-3 cursor-pointer p-2 hover:bg-slate-50 rounded transition-colors">
                  <input
                    type="radio"
                    name="layout_type"
                    value="navbar"
                    checked={layoutConfig.layout_type === "navbar"}
                    onChange={handleLayoutChange}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  <span className="text-sm font-semibold text-slate-700">Top Navbar (Horizontal)</span>
                </label>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Choose whether the navigation menu appears on the left or at the top.</p>
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                <ImageIcon className="w-4 h-4 text-slate-400" /> Custom Favicon
              </label>
              <div className="flex flex-col gap-4">
                <div className="h-12 w-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                  {layoutConfig.favicon ? (
                    <img src={layoutConfig.favicon} alt="Favicon" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-slate-300" />
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFaviconUpload}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-colors"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Sidebar/Tab Logo. Max 200KB.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 md:col-span-1">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide">
                <ImageIcon className="w-4 h-4 text-slate-400" /> Navbar Logo
              </label>
              <div className="flex flex-col gap-4">
                <div className="h-12 w-24 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
                  {layoutConfig.navbar_logo ? (
                    <img src={layoutConfig.navbar_logo} alt="Navbar Logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <span className="text-xs text-slate-400 font-medium">No Logo</span>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleNavbarLogoUpload}
                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 transition-colors"
                  />
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Optional. Horizontal logo for Navbar layout.</p>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-sm hover:shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {loading ? "Saving Changes..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CustomizingAdmin;
