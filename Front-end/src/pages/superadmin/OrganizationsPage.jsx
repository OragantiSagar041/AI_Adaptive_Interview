import { useMemo, useState } from "react";
import { Building2, Plus, Search, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const seed = [
{ id: "o1", name: "ABC Technologies", industry: "Technology", plan: "Enterprise", jobs: 48, recruiters: 18, candidates: 1256, status: "Active" },
{ id: "o2", name: "XYZ Healthcare", industry: "Healthcare", plan: "Enterprise", jobs: 32, recruiters: 14, candidates: 842, status: "Active" },
{ id: "o3", name: "Global Finance", industry: "Finance", plan: "Professional", jobs: 21, recruiters: 10, candidates: 564, status: "Active" },
{ id: "o4", name: "Nova Retail Group", industry: "Retail", plan: "Professional", jobs: 18, recruiters: 8, candidates: 421, status: "Active" },
{ id: "o5", name: "Helix Biotech", industry: "Biotech", plan: "Trial", jobs: 12, recruiters: 6, candidates: 287, status: "Trial" },
{ id: "o6", name: "Orbit Labs", industry: "Aerospace", plan: "Starter", jobs: 6, recruiters: 3, candidates: 118, status: "Suspended" }];

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState(seed);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const filtered = useMemo(() => {
    return orgs.filter((o) => {
      const q = query.toLowerCase();
      const matchQ = !q || o.name.toLowerCase().includes(q) || o.industry.toLowerCase().includes(q);
      const matchS = statusFilter === "all" || o.status === statusFilter;
      return matchQ && matchS;
    });
  }, [orgs, query, statusFilter]);
  function handleSave(form) {
    if (editing) {
      setOrgs((p) => p.map((o) => o.id === editing.id ? { ...editing, ...form } : o));
      toast.success(`${form.name} updated`);
    } else
    {
      setOrgs((p) => [{ ...form, id: `o${Date.now()}` }, ...p]);
      toast.success(`${form.name} created`);
    }
    setOpen(false);
    setEditing(null);
  }
  function handleDelete(o) {
    setOrgs((p) => p.filter((x) => x.id !== o.id));
    toast.success(`${o.name} removed`);
  }
  return <AdminShell title="Organizations" description="Add, edit and monitor all tenant organizations on the platform." actions={<Dialog open={open} onOpenChange={(v) => {setOpen(v);if (!v)
    setEditing(null);}}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Add Organization</Button>
          </DialogTrigger>
          <OrgForm key={editing?.id ?? "new"} initial={editing} onSave={handleSave} />
        </Dialog>}>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Total Orgs" value={orgs.length} />
        <Stat label="Active" value={orgs.filter((o) => o.status === "Active").length} />
        <Stat label="Trial" value={orgs.filter((o) => o.status === "Trial").length} />
        <Stat label="Suspended" value={orgs.filter((o) => o.status === "Suspended").length} />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search organizations…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-8" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Trial">Trial</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Jobs</TableHead>
                <TableHead className="text-right">Recruiters</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => <TableRow key={o.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></div>
                    {o.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.industry}</TableCell>
                  <TableCell><Badge variant="secondary">{o.plan}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{o.jobs}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.recruiters}</TableCell>
                  <TableCell className="text-right tabular-nums">{o.candidates.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={o.status === "Active" ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20" :
                o.status === "Trial" ? "bg-amber-500/15 text-amber-700 hover:bg-amber-500/20" :
                "bg-rose-500/15 text-rose-700 hover:bg-rose-500/20"}>{o.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => {setEditing(o);setOpen(true);}}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(o)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                  </TableCell>
                </TableRow>)}
              {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">No organizations match filters.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminShell>;
}
function Stat({ label, value }) {
  return <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </CardContent></Card>;
}
function OrgForm({ initial, onSave }) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    industry: initial?.industry ?? "Technology",
    plan: initial?.plan ?? "Professional",
    jobs: initial?.jobs ?? 0,
    recruiters: initial?.recruiters ?? 0,
    candidates: initial?.candidates ?? 0,
    status: initial?.status ?? "Active"
  });
  return <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Edit organization" : "Add organization"}</DialogTitle>
        <DialogDescription>Set up a tenant on the platform.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Industry"><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></Field>
        <Field label="Plan">
          <Select value={form.plan} onValueChange={(v) => setForm({ ...form, plan: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Enterprise", "Professional", "Starter", "Trial"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Active", "Trial", "Suspended"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Jobs"><Input type="number" value={form.jobs} onChange={(e) => setForm({ ...form, jobs: +e.target.value })} /></Field>
        <Field label="Recruiters"><Input type="number" value={form.recruiters} onChange={(e) => setForm({ ...form, recruiters: +e.target.value })} /></Field>
        <Field label="Candidates"><Input type="number" value={form.candidates} onChange={(e) => setForm({ ...form, candidates: +e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={() => form.name && onSave(form)}>{initial ? "Save changes" : "Create organization"}</Button>
      </DialogFooter>
    </DialogContent>;
}
function Field({ label, children }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}