import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Settings, Loader2, Eye, EyeOff, Plug, Server, MessageSquare, Video, Mail, Calendar } from "lucide-react";
import { toast } from "sonner";
import { useSelector } from "react-redux";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";
import { API_BASE_URL } from "@/apiConfig";

const CATEGORY_ICONS = {
  "HRIS": Server,
  "ATS": Plug,
  "Chat": MessageSquare,
  "Video": Video,
  "Email": Mail,
  "Calendar": Calendar,
};

const CATEGORY_COLORS = {
  "HRIS": "from-blue-500/20 to-indigo-500/20 text-blue-600",
  "ATS": "from-emerald-500/20 to-teal-500/20 text-emerald-600",
  "Chat": "from-purple-500/20 to-fuchsia-500/20 text-purple-600",
  "Video": "from-orange-500/20 to-rose-500/20 text-orange-600",
  "Email": "from-cyan-500/20 to-sky-500/20 text-cyan-600",
  "Calendar": "from-pink-500/20 to-rose-500/20 text-pink-600",
};

/* ─── Configure Modal ──────────────────────────────────────────────── */
function ConfigureModal({ integration, onClose, onSaved }) {
  const { token } = useSelector((s) => s.auth);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});

  useEffect(() => {
    if (!integration) return;
    const initial = {};
    const sp = {};
    (integration.fields || []).forEach((f) => {
      initial[f.key] = integration.config?.[f.key] || "";
      sp[f.key] = false;
    });
    setForm(initial);
    setShowPasswords(sp);
  }, [integration]);

  if (!integration) return null;

  const handleChange = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const toggleShow = (key) => setShowPasswords((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/api/superadmin/integrations/${integration.id}`,
        { config: form },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`${integration.name} configured successfully!`);
      onSaved(integration.id);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800/60/90 backdrop-blur-xl border border-white/40 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] w-full max-w-md relative overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="relative overflow-hidden px-8 py-6">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-fuchsia-600 opacity-100"></div>
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          
          <div className="relative flex items-center justify-between z-10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800/60/20 shadow-inner backdrop-blur-md flex items-center justify-center ring-1 ring-white/30">
                <Settings className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">{integration.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <p className="text-xs font-medium text-indigo-100 uppercase tracking-wider">{integration.category} Setup</p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/20 text-white transition-all duration-200"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-8 space-y-6">
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed font-medium">{integration.description}</p>

          <div className="space-y-5">
            {(integration.fields || []).map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={field.key} className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  {field.label}
                </Label>
                <div className="relative group">
                  <Input
                    id={field.key}
                    type={field.type === "password" && !showPasswords[field.key] ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={form[field.key] || ""}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    className="pr-10 h-11 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 shadow-sm transition-all duration-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 group-hover:border-indigo-300 rounded-xl"
                  />
                  {field.type === "password" && (
                    <button
                      type="button"
                      onClick={() => toggleShow(field.key)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors p-1"
                    >
                      {showPasswords[field.key] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {field.type === "password" && form[field.key] === "••••••••" && (
                  <p className="text-[10px] font-medium text-emerald-600 flex items-center gap-1.5 mt-1">
                    <CheckCircle2 className="h-3 w-3" /> Securely stored. Enter new value to override.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 flex gap-4 bg-slate-50 dark:bg-slate-900/50/50">
          <Button
            className="flex-1 h-11 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md hover:shadow-xl hover:shadow-indigo-500/25 transition-all duration-300 rounded-xl font-medium"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : "Save Configuration"}
          </Button>
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="flex-1 h-11 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:bg-slate-800/50 hover:text-slate-900 dark:text-white rounded-xl font-medium transition-all"
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────── */
export default function IntegrationsPage() {
  const { token } = useSelector((s) => s.auth);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [configTarget, setConfigTarget] = useState(null);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/superadmin/integrations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIntegrations(res.data.integrations || []);
    } catch (err) {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleToggle = async (integ) => {
    const newConnected = !integ.connected;
    setIntegrations((prev) =>
      prev.map((r) =>
        r.id === integ.id
          ? { ...r, connected: newConnected, status: newConnected ? "Healthy" : "Disconnected" }
          : r
      )
    );
    setTogglingId(integ.id);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/superadmin/integrations/${integ.id}/toggle`,
        { connected: newConnected },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`${integ.name} ${newConnected ? "connected" : "disconnected"}`, {
        icon: newConnected ? <Plug className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" />
      });
    } catch (err) {
      setIntegrations((prev) =>
        prev.map((r) =>
          r.id === integ.id ? { ...r, connected: integ.connected, status: integ.status } : r
        )
      );
      toast.error(err?.response?.data?.detail || `Failed to toggle ${integ.name}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfigured = (integrationId) => {
    fetchIntegrations();
  };

  const categories = [...new Set(integrations.map((r) => r.category))];

  if (loading) {
    return (
      <AdminShell title="Integrations" description="Connect the platform with your tools.">
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="relative">
            <div className="absolute inset-0 bg-indigo-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600 relative z-10" />
          </div>
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">Loading workspace integrations...</span>
        </div>
      </AdminShell>
    );
  }

  return (
    <>
      <AdminShell
        title="App Directory"
        description="Connect HireIQ with your HRIS, ATS, email, calendar and chat tools to automate your workflows."
      >
        <div className="max-w-6xl space-y-12 pb-12">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat] || Plug;
            const colorClass = CATEGORY_COLORS[cat] || "from-slate-500/20 to-gray-500/20 text-slate-600 dark:text-slate-400";
            
            return (
              <div key={cat} className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 fade-in fill-mode-both" style={{animationDelay: `${categories.indexOf(cat) * 100}ms`}}>
                
                {/* Category Header */}
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl bg-gradient-to-br ${colorClass} backdrop-blur-sm border border-white/50 shadow-sm`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                      {cat}
                    </h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">{integrations.filter(r => r.category === cat).length} Apps Available</p>
                  </div>
                </div>

                {/* Grid */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {integrations
                    .filter((r) => r.category === cat)
                    .map((r) => (
                      <Card 
                        key={r.id} 
                        className={`group relative overflow-hidden transition-all duration-300 border hover:border-indigo-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl ${
                          r.connected ? 'bg-white dark:bg-slate-800/60 shadow-sm border-slate-200 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-900/50/50 border-slate-100 dark:border-slate-800'
                        }`}
                      >
                        {/* Status Indicator Glow */}
                        {r.connected && (
                          <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl group-hover:bg-emerald-400/20 transition-all duration-500"></div>
                        )}
                        
                        <CardHeader className="pb-4 relative z-10">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0 pr-4">
                              <div className="flex items-center gap-2 mb-1.5">
                                <CardTitle className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">{r.name}</CardTitle>
                                {r.connected && (
                                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                                )}
                              </div>
                              <CardDescription className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-medium line-clamp-2 h-10">
                                {r.description}
                              </CardDescription>
                            </div>
                            <button
                              onClick={() => handleToggle(r)}
                              disabled={togglingId === r.id}
                              className={`relative inline-flex h-8 w-16 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 shadow-sm ${
                                r.connected ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-slate-300 hover:bg-slate-400'
                              } ${(togglingId === r.id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <span className="sr-only">Toggle {r.name}</span>
                              <span
                                className={`absolute left-2 text-[10px] font-bold text-white transition-opacity duration-300 ${
                                  r.connected ? 'opacity-100' : 'opacity-0'
                                }`}
                              >
                                ON
                              </span>
                              <span
                                className={`absolute right-1.5 text-[10px] font-bold text-slate-100 transition-opacity duration-300 ${
                                  r.connected ? 'opacity-0' : 'opacity-100'
                                }`}
                              >
                                OFF
                              </span>
                              <span
                                aria-hidden="true"
                                className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white dark:bg-slate-800/60 shadow-md ring-0 transition duration-300 ease-in-out z-10 ${
                                  r.connected ? 'translate-x-9' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </CardHeader>
                        
                        <CardContent className="pt-0 relative z-10 flex flex-col gap-4">
                          {/* Divider */}
                          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent opacity-50"></div>
                          
                          <div className="flex items-center justify-between">
                            <Badge
                              variant="outline"
                              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border-0 rounded-lg flex items-center gap-1.5 ${
                                r.status === "Healthy"
                                  ? "bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100"
                                  : r.status === "Degraded"
                                  ? "bg-amber-50 text-amber-700 shadow-sm shadow-amber-100"
                                  : "bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 shadow-inner"
                              }`}
                            >
                              {r.status === "Healthy" ? (
                                <CheckCircle2 className="h-3 w-3" />
                              ) : r.status === "Degraded" ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              ) : (
                                <XCircle className="h-3 w-3 opacity-70" />
                              )}
                              {r.status}
                            </Badge>
                            
                            <Button
                              size="sm"
                              className={`h-8 px-4 rounded-lg text-xs font-semibold shadow-sm transition-all duration-300 ${
                                r.connected 
                                  ? 'bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 hover:text-indigo-600 hover:border-indigo-200' 
                                  : 'bg-indigo-50 border-transparent text-indigo-700 hover:bg-indigo-100'
                              }`}
                              onClick={() => setConfigTarget(r)}
                            >
                              <Settings className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                              Configure
                            </Button>
                          </div>
                          
                          {r.configured_at && (
                            <div className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                              Updated {new Date(r.configured_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </AdminShell>

      {/* Configure Modal */}
      {configTarget && (
        <ConfigureModal
          integration={configTarget}
          onClose={() => setConfigTarget(null)}
          onSaved={handleConfigured}
        />
      )}
    </>
  );
}