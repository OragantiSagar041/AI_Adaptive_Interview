import { useState, useEffect } from "react";
import { Check, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import axios from "axios";
import { useSelector } from "react-redux";
import { API_BASE_URL } from "@/apiConfig";

export default function SubscriptionManagementPage() {
  const [subs, setSubs] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const token = useSelector((state) => state.auth.token);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const headers = { Authorization: `Bearer ${token}` };
        
        // Fetch plans and profile simultaneously
        const [plansRes, profileRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/plans`),
          axios.get(`${API_BASE_URL}/api/superadmin/profile`, { headers })
        ]);
        
        // Transform plans
        const backendPlans = plansRes.data.map(p => ({
          id: p.id,
          name: p.plan_name,
          price: p.price,
          credits: `${p.credits / 1000}k / mo`, // format nicely
          features: p.features || []
        }));
        setPlans(backendPlans);
        
        // Get own subscription
        const profile = profileRes.data;
        const currentPlanKey = profile.subscription_plan_key || "basic";
        const matchedPlan = backendPlans.find(p => (p.name || "").toLowerCase() === currentPlanKey.toLowerCase()) || backendPlans[0];

        const backendSubs = [{
          id: profile.company_id || profile.id,
          org: profile.company_name || profile.username || "Your Organization",
          plan: matchedPlan?.name || "Basic",
          renews: "N/A",
          amount: matchedPlan?.price || 0,
          status: profile.is_expired ? "Past Due" : "Active"
        }];
        setSubs(backendSubs);
        
      } catch (error) {
        console.error("Failed to fetch subscription data:", error);
        toast.error("Failed to load subscriptions");
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchData();
    }
  }, [token]);

  async function changePlan(id, newPlanName) {
    try {
      const price = plans.find((p) => p.name === newPlanName)?.price ?? 0;
      
      // Optomistic UI update
      setSubs((prev) => prev.map((s) => s.id === id ? { ...s, plan: newPlanName, amount: price } : s));
      
      // Find the corresponding plan key for backend (e.g. "Professional" -> "advance" or just pass name)
      // Usually the backend uses basic/advance/enterprise keys, let's send what they select for now
      await axios.put(
        `${API_BASE_URL}/api/superadmin/subscription`,
        { subscription_plan: newPlanName.toLowerCase() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Plan updated to ${newPlanName}`);
    } catch (error) {
      console.error("Failed to update plan:", error);
      toast.error("Failed to update plan on server");
    }
  }

  if (loading) {
    return (
      <AdminShell title="Subscription Management" description="Plans, renewals and billing for every organization.">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Subscription Management" description="Plans, renewals and billing for every organization.">
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.name} className={p.name === "Professional" ? "border-primary shadow-sm" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
                  <Package className="h-4 w-4" />
                </div>
                {p.name === "Professional" && <Badge>Popular</Badge>}
              </div>
              <CardTitle>{p.name}</CardTitle>
              <CardDescription>
                <span className="text-2xl font-semibold text-foreground">${p.price}</span> / mo · {p.credits}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {p.features.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500" />
                  {f}
                </div>
              ))}
              <Button className="mt-3 w-full" variant={p.name === "Professional" ? "default" : "outline"} onClick={() => toast.success(`Editing ${p.name} plan`)}>
                Manage plan
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active subscriptions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Renews</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.org}</TableCell>
                  <TableCell>
                    <Select value={s.plan} onValueChange={(v) => changePlan(s.id, v)}>
                      <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.renews}</TableCell>
                  <TableCell className="text-right tabular-nums">${s.amount}</TableCell>
                  <TableCell>
                    <Badge className={
                      s.status === "Active" ? "bg-emerald-500/15 text-emerald-700" :
                      s.status === "Trial" ? "bg-amber-500/15 text-amber-700" :
                      "bg-rose-500/15 text-rose-700"
                    }>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => toast.success(`Invoice sent to ${s.org}`)}>
                      Send invoice
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminShell>
  );
}