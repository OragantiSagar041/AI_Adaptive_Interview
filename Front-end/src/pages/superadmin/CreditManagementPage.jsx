import { useState, useEffect } from "react";
import { Gift, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import Swal from "sweetalert2";
import { API_BASE_URL } from "@/apiConfig";

export default function CreditManagementPage() {
  const [rows, setRows] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [kpis, setKpis] = useState({ total_credits_system: 0, credits_consumed_month: 0, active_topups: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  
  const token = useSelector((state) => state.auth.token);
  const dispatch = useDispatch();

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
          const used = (a.sessions_created || 0) * 100;
          const remaining = a.credits || 0;
          const allocated = used + remaining;
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
    if (token) fetchData();
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

      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Recent ledger</CardTitle></CardHeader>
        <CardContent><Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Organization</TableHead><TableHead>Action</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{ledger.map((l, i) => <TableRow key={i}>
              <TableCell className="text-muted-foreground text-sm">{l.date ? new Date(l.date).toLocaleString() : ''}</TableCell>
              <TableCell>{l.org}</TableCell>
              <TableCell>{l.amount > 0 ? "Top-up" : "Usage"}</TableCell>
              <TableCell className={`text-right tabular-nums ${l.amount > 0 ? "text-emerald-600" : "text-rose-600"}`}>{l.amount > 0 ? `+${l.amount.toLocaleString()}` : l.amount.toLocaleString()}</TableCell>
              <TableCell className="text-muted-foreground">{l.status}</TableCell>
            </TableRow>)}</TableBody>
        </Table></CardContent>
      </Card>
    </AdminShell>
  );
}

function AllocateForm({ rows, onAllocate }) {
  const [org, setOrg] = useState(rows[0]?.id || "");
  const [amount, setAmount] = useState(10000);
  return <DialogContent>
      <DialogHeader><DialogTitle>Allocate credits</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5"><Label className="text-xs">Recruiter</Label>
          <Select value={org} onValueChange={setOrg}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{rows.map((r) => <SelectItem key={r.id} value={r.id}>{r.org}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Amount</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        </div>
      </div>
      <DialogFooter><Button onClick={() => amount > 0 && onAllocate(org, amount)}>Allocate</Button></DialogFooter>
    </DialogContent>;
}