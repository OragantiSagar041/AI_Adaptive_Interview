import { useState, useEffect } from "react";
import { Gift, Plus, Loader2, CreditCard, RefreshCw, Activity, Coins, Check, X } from "lucide-react";
import { toast } from "sonner";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import axios from "axios";
import { useSelector, useDispatch } from "react-redux";
import { updateCredits } from "@/store/slices/authSlice";
import { API_BASE_URL } from "@/apiConfig";

export default function CreditManagementPage() {
  const [rows, setRows] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [kpis, setKpis] = useState({ total_credits_system: 0, credits_consumed_month: 0, active_topups: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creditRequests, setCreditRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  
  const token = useSelector((state) => state.auth.token);
  const dispatch = useDispatch();

  const loadCreditRequests = async () => {
    setLoadingRequests(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/super-admin/credit-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCreditRequests(res.data.data || []);
    } catch (err) {
      console.error("Failed to load credit requests:", err);
      toast.error("Failed to load credit requests");
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleDecideCreditRequest = async (requestId, status) => {
    const confirm = await Swal.fire({
      title: `${status === 'approved' ? 'Approve' : 'Reject'} Request?`,
      text: `Are you sure you want to ${status === 'approved' ? 'approve' : 'reject'} this request?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      background: '#161c2d',
      color: '#fff'
    });
    if (!confirm.isConfirmed) return;

    try {
      await axios.put(`${API_BASE_URL}/super-admin/credit-requests/${requestId}`, { status: status }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      toast.success(`Credit request ${status} successfully!`);
      loadCreditRequests();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, adminsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/superadmin/credits/stats`, { headers }),
        axios.get(`${API_BASE_URL}/super-admin/admins`, { headers })
      ]);
      
      const stats = statsRes.data;
      if (stats.status === "success") {
        setKpis(stats.kpis || { total_credits_system: 0, credits_consumed_month: 0, active_topups: 0 });
        setLedger(stats.history || []);
      }

      const admins = adminsRes.data;
      if (admins.status === "success") {
        setRows(admins.data.map(a => {
          const sessionsCreated = a.sessions_created || 0;
          const remaining = a.credits || 0;
          
          // Use the exact ledger history (total_allocated_credits) if available, otherwise fallback to legacy approximation
          const allocated = a.total_allocated_credits !== undefined 
            ? a.total_allocated_credits 
            : (sessionsCreated + remaining);
            
          // True utilization based on total gifted credits minus what they have left
          const used = allocated - remaining;
          
          return {
            id: a.id,
            org: a.name || a.username,
            allocated,
            used,
            remaining
          };
        }));
      }
    } catch (error) {
      console.error("Failed to load credit data", error);
      toast.error("Failed to load credit data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();
      loadCreditRequests();
    }
  }, [token]);

  const handleGiftClick = async (adminId, orgName) => {
    const { value: amount } = await Swal.fire({
      title: `Transfer credits`,
      text: `How many credits do you want to transfer to ${orgName}?`,
      input: "number",
      inputLabel: "Amount",
      inputPlaceholder: "e.g., 10000",
      showCancelButton: true,
      confirmButtonText: "Transfer",
      confirmButtonColor: "#4f46e5",
      inputValidator: (value) => {
        if (!value || parseInt(value) <= 0) {
          return "Please enter a valid positive number!";
        }
      }
    });

    if (amount) {
      allocate(adminId, parseInt(amount));
    }
  };

  async function allocate(adminId, amount) {
    try {
      const res = await axios.post(`${API_BASE_URL}/super-admin/admins/${adminId}/add-credits`, { credits: amount }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(`Allocated ${amount.toLocaleString()} credits`);
      
      // Update the main credit score in the header
      if (res.data && res.data.super_admin_credits !== undefined) {
        dispatch(updateCredits(res.data.super_admin_credits));
      }
      
      setOpen(false);
      fetchData(); // Refresh data
    } catch (error) {
      console.error("Failed to allocate credits", error);
      toast.error(error.response?.data?.detail || "Failed to allocate credits");
    }
  }

  if (loading) {
    return (
      <AdminShell title="Credit Management" description="Allocate AI credits, monitor usage and audit consumption per recruiter.">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Credit Management" description="Allocate AI credits, monitor usage and audit consumption per recruiter." actions={
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button><Plus className="h-4 w-4" /> Allocate Credits</Button></DialogTrigger>
        {rows.length > 0 && <AllocateForm rows={rows} onAllocate={allocate} />}
      </Dialog>
    }>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total system credits</div><div className="mt-1 text-2xl font-semibold">{kpis.total_credits_system.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Consumed this month</div><div className="mt-1 text-2xl font-semibold">{kpis.credits_consumed_month.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Active top-ups</div><div className="mt-1 text-2xl font-semibold text-emerald-600">{kpis.active_topups}</div></CardContent></Card>
      </div>

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Per-recruiter usage</CardTitle></CardHeader>
        <CardContent><Table>
          <TableHeader><TableRow>
            <TableHead>Recruiter</TableHead>
            <TableHead className="text-right">Allocated</TableHead>
            <TableHead className="text-right">Used</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead className="w-[220px]">Utilization</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((r) => {
              const pct = r.allocated > 0 ? Math.round((r.used / r.allocated) * 100) : 0;
              const low = pct >= 90 || r.remaining < 1000;
              return <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.org}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.allocated.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.used.toLocaleString()}</TableCell>
                  <TableCell className={`text-right tabular-nums font-medium ${low ? "text-rose-600" : "text-emerald-600"}`}>{r.remaining.toLocaleString()}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><Progress value={pct} className="h-1.5" /><span className="w-9 text-right text-xs tabular-nums">{pct}%</span></div></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => handleGiftClick(r.id, r.org)}>
                      <Gift className="h-4 w-4" /> Transfer
                    </Button>
                  </TableCell>
                </TableRow>;
            })}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No recruiters found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table></CardContent>
      </Card>

      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm mb-6">
        <div className="p-6 sm:p-8 border-b border-border flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md border border-amber-400/30 shrink-0">
            <CreditCard size={26} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-2xl font-black text-foreground tracking-tight leading-tight">
              Pending Credit Requests
            </h3>
            <p className="text-sm text-muted-foreground font-semibold tracking-wide mt-0.5">
              Approve or reject credit request notifications from sub-admins
            </p>
          </div>
        </div>

        <div className="overflow-x-auto p-4 sm:p-6 bg-background">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-muted-foreground tracking-wider">Date</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-muted-foreground tracking-wider">Admin</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-muted-foreground tracking-wider">Requested</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-muted-foreground tracking-wider text-center">Status</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-muted-foreground tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingRequests ? (
                <tr>
                  <td colSpan="5" className="p-16 text-center text-slate-500 dark:text-slate-400 font-semibold">
                    <RefreshCw className="animate-spin text-amber-500 inline mr-2 w-6 h-6" /> Syncing requests...
                  </td>
                </tr>
              ) : creditRequests.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800/50 flex items-center justify-center mb-4">
                        <Activity size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 font-medium text-base">No pending credit requests.</p>
                      <p className="text-slate-400 text-sm mt-1">You're all caught up!</p>
                    </div>
                  </td>
                </tr>
              ) : (
                creditRequests.map(r => (
                  <tr key={r.id || r._id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 dark:text-slate-400 font-bold uppercase text-xs">
                          {(r.admin_name || r.admin_username || 'U')[0]}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{r.admin_name || r.admin_username}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="inline-flex items-center gap-1.5 text-sm font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200/50">
                        <Coins size={14} />
                        {r.amount || r.amount_requested}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm shadow-emerald-100' : r.status === 'rejected' ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm shadow-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-200 shadow-sm shadow-amber-100'}`}>
                        {r.status || 'pending'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {r.status === 'pending' || !r.status ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDecideCreditRequest(r.id || r._id, 'approved')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer border-none shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            onClick={() => handleDecideCreditRequest(r.id || r._id, 'rejected')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-rose-100 text-slate-600 dark:text-slate-400 hover:text-rose-600 font-bold text-xs cursor-pointer border-none transition-all"
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider bg-slate-50 dark:bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>


    </AdminShell>
  );
}

function AllocateForm({ rows, onAllocate }) {
  const [org, setOrg] = useState(rows[0]?.id || "");
  const [amount, setAmount] = useState(10000);
  return <DialogContent className="bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white sm:max-w-[425px]">
      <DialogHeader><DialogTitle className="text-slate-900 dark:text-white">Allocate credits</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label className="text-xs">Recruiter</Label>
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-800/60 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700">{rows.map((r) => <SelectItem key={r.id} value={r.id} className="focus:bg-slate-100 dark:bg-slate-800/50 cursor-pointer">{r.org}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Amount</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        </div>
      </div>
      <DialogFooter><Button onClick={() => amount > 0 && onAllocate(org, amount)}>Allocate</Button></DialogFooter>
    </DialogContent>;
}