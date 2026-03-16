import { useState } from "react";
import {
  MessageSquare, Clock, AlertCircle, CheckCircle2, Plus,
  Trash2, Edit, Search, ChevronDown, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  loadTickets, addTicket, updateTicket, deleteTicket, avgResolutionHours,
  type Ticket, type TicketCategory, type TicketPriority, type TicketStatus,
} from "../../lib/complaintsStore";
import { loadClients } from "../../lib/clientStore";

const CATEGORIES: TicketCategory[] = ["billing", "technical", "delivery", "design", "other"];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: TicketStatus[] = ["open", "in-progress", "resolved", "closed"];

const PRIORITY_VARIANT: Record<TicketPriority, "default" | "secondary" | "outline" | "destructive"> = {
  low: "outline", medium: "secondary", high: "default", urgent: "destructive",
};

const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline" | "destructive"> = {
  open: "destructive", "in-progress": "default", resolved: "secondary", closed: "outline",
};

const emptyForm = {
  clientId: "", client: "", category: "technical" as TicketCategory,
  priority: "medium" as TicketPriority, status: "open" as TicketStatus,
  subject: "", description: "", assignedTo: "",
};

export function Complaints() {
  const [tickets, setTickets] = useState<Ticket[]>(() => loadTickets());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<typeof emptyForm>>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const clients = loadClients();
  const refresh = () => setTickets(loadTickets());

  const filtered = tickets.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      t.client.toLowerCase().includes(q) ||
      t.subject.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchPriority = filterPriority === "all" || t.priority === filterPriority;
    return matchSearch && matchStatus && matchPriority;
  });

  const stats = {
    open: tickets.filter((t) => t.status === "open").length,
    inProgress: tickets.filter((t) => t.status === "in-progress").length,
    resolved: tickets.filter((t) => t.status === "resolved").length,
    avgHours: avgResolutionHours(tickets),
  };

  const validate = () => {
    const e: Partial<typeof emptyForm> = {};
    if (!form.client.trim() && !form.clientId) e.client = "Client is required";
    if (!form.subject.trim()) e.subject = "Subject is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const clientLabel = clients.find((c) => c.id === form.clientId)?.clientName || form.client;
    if (editId) {
      updateTicket(editId, {
        client: clientLabel, clientId: form.clientId,
        category: form.category, priority: form.priority,
        status: form.status, subject: form.subject,
        description: form.description, assignedTo: form.assignedTo || undefined,
      });
    } else {
      addTicket({
        client: clientLabel, clientId: form.clientId,
        category: form.category, priority: form.priority,
        status: form.status, subject: form.subject,
        description: form.description, assignedTo: form.assignedTo || undefined,
      });
    }
    refresh();
    closeForm();
  };

  const openAdd = () => { setEditId(null); setForm(emptyForm); setErrors({}); setIsFormOpen(true); };

  const openEdit = (t: Ticket) => {
    setEditId(t.id);
    setForm({
      clientId: t.clientId, client: t.client, category: t.category,
      priority: t.priority, status: t.status, subject: t.subject,
      description: t.description, assignedTo: t.assignedTo ?? "",
    });
    setErrors({});
    setIsFormOpen(true);
  };

  const closeForm = () => { setIsFormOpen(false); setEditId(null); setForm(emptyForm); setErrors({}); };

  const set = (k: keyof typeof emptyForm) => (val: string) =>
    setForm((f) => ({ ...f, [k]: val }));

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Complaints & Support</h1>
          <p className="text-muted-foreground mt-1">Track and resolve customer issues</p>
        </div>
        <Button className="gap-2" onClick={openAdd}>
          <Plus className="h-4 w-4" /> New Ticket
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Open", value: stats.open, icon: MessageSquare, color: "text-destructive" },
          { label: "In Progress", value: stats.inProgress, icon: Clock, color: "text-yellow-500" },
          { label: "Resolved", value: stats.resolved, icon: CheckCircle2, color: "text-green-500" },
          { label: "Avg Resolution", value: `${stats.avgHours}h`, icon: AlertCircle, color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="shadow-md">
            <CardContent className="p-6">
              <Icon className={`h-5 w-5 ${color} mb-2`} />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tickets Table */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Support Tickets</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs w-44"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue placeholder="All Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              {tickets.length === 0
                ? "No tickets yet. Click \"New Ticket\" to create one."
                : "No tickets match your filters."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                    <TableCell className="font-medium">{t.client}</TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm">{t.subject}</TableCell>
                    <TableCell className="capitalize text-sm">{t.category}</TableCell>
                    <TableCell>
                      <Badge variant={PRIORITY_VARIANT[t.priority]} className="capitalize text-xs">{t.priority}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[t.status]} className="capitalize text-xs">{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(t.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => setViewTicket(t)}>View</Button>
                        <Button variant="ghost" size="sm" className="h-7"
                          onClick={() => openEdit(t)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive"
                          onClick={() => { deleteTicket(t.id); refresh(); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Add / Edit Ticket Dialog ── */}
      <Dialog open={isFormOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Ticket" : "New Support Ticket"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {/* Client */}
            <div className="space-y-1.5">
              <Label>Client <span className="text-destructive">*</span></Label>
              <Select value={form.clientId}
                onValueChange={(v) => {
                  const c = clients.find((cl) => cl.id === v);
                  setForm((f) => ({ ...f, clientId: v, client: c?.clientName ?? "" }));
                }}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.clientName}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.client && <p className="text-xs text-destructive">{errors.client}</p>}
            </div>

            {/* Subject */}
            <div className="space-y-1.5">
              <Label>Subject <span className="text-destructive">*</span></Label>
              <Input value={form.subject} onChange={(e) => set("subject")(e.target.value)}
                placeholder="Brief description of the issue" />
              {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
            </div>

            {/* Category + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={set("category")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={set("priority")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status + Assigned To */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={set("status")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assigned To</Label>
                <Input value={form.assignedTo} onChange={(e) => set("assignedTo")(e.target.value)}
                  placeholder="Staff name (optional)" />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <textarea
                value={form.description}
                onChange={(e) => set("description")(e.target.value)}
                rows={4}
                placeholder="Detailed description of the issue…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={closeForm}>
              <X className="h-4 w-4 mr-1.5" /> Cancel
            </Button>
            <Button className="flex-1" onClick={handleSubmit}>
              {editId ? "Save Changes" : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Ticket Dialog ── */}
      {viewTicket && (
        <Dialog open={!!viewTicket} onOpenChange={(o) => { if (!o) setViewTicket(null); }}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {viewTicket.id}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">{viewTicket.subject}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{viewTicket.client}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge variant={PRIORITY_VARIANT[viewTicket.priority]} className="capitalize">{viewTicket.priority}</Badge>
                <Badge variant={STATUS_VARIANT[viewTicket.status]} className="capitalize">{viewTicket.status}</Badge>
                <Badge variant="outline" className="capitalize">{viewTicket.category}</Badge>
              </div>
              {viewTicket.description && (
                <div className="rounded-lg bg-muted p-3 text-sm">{viewTicket.description}</div>
              )}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p>{fmtDate(viewTicket.createdAt)}</p>
                </div>
                {viewTicket.resolvedAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Resolved</p>
                    <p>{fmtDate(viewTicket.resolvedAt)}</p>
                  </div>
                )}
                {viewTicket.assignedTo && (
                  <div>
                    <p className="text-xs text-muted-foreground">Assigned To</p>
                    <p>{viewTicket.assignedTo}</p>
                  </div>
                )}
              </div>
              {/* Quick status change */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Update Status</Label>
                <div className="flex gap-2 flex-wrap">
                  {STATUSES.map((s) => (
                    <Button key={s} size="sm" variant={viewTicket.status === s ? "default" : "outline"}
                      className="capitalize text-xs h-7"
                      onClick={() => {
                        updateTicket(viewTicket.id, { status: s });
                        refresh();
                        setViewTicket((prev) => prev ? { ...prev, status: s } : null);
                      }}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setViewTicket(null)}>Close</Button>
              <Button className="flex-1" onClick={() => { setViewTicket(null); openEdit(viewTicket); }}>
                <Edit className="h-4 w-4 mr-1.5" /> Edit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
