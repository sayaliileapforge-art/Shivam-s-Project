import { useState } from "react";
import {
  Wallet, TrendingUp, DollarSign, AlertCircle, Plus, Trash2,
  ArrowUpCircle, ArrowDownCircle, RefreshCcw, CreditCard, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "../components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  loadTransactions, addTransaction, updateTransaction, deleteTransaction,
  getTotalRevenue, getPending, getOverdue, getMonthlyRevenue,
  type Transaction, type TxnType, type TxnStatus,
} from "../../lib/transactionStore";
import { loadClients } from "../../lib/clientStore";

const TXN_TYPES: TxnType[] = ["payment", "invoice", "refund", "credit"];
const TXN_STATUSES: TxnStatus[] = ["paid", "pending", "overdue", "refunded"];

const STATUS_VARIANT: Record<TxnStatus, "default" | "secondary" | "destructive" | "outline"> = {
  paid: "default", pending: "secondary", overdue: "destructive", refunded: "outline",
};

const TYPE_ICON: Record<TxnType, React.ReactNode> = {
  payment: <ArrowDownCircle className="h-4 w-4 text-green-500" />,
  invoice: <CreditCard className="h-4 w-4 text-blue-500" />,
  refund: <ArrowUpCircle className="h-4 w-4 text-orange-500" />,
  credit: <RefreshCcw className="h-4 w-4 text-purple-500" />,
};

const emptyForm = {
  clientId: "", client: "", amount: "", type: "payment" as TxnType,
  status: "paid" as TxnStatus, date: new Date().toISOString().split("T")[0],
  dueDate: "", note: "",
};

export function Finance() {
  const [txns, setTxns] = useState<Transaction[]>(() => loadTransactions());
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<typeof emptyForm>>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const clients = loadClients();
  const refresh = () => setTxns(loadTransactions());

  const filtered = txns.filter((t) => {
    const q = search.toLowerCase();
    const matchSearch =
      t.client.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      (t.note ?? "").toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const revenue = getTotalRevenue(txns);
  const pending = getPending(txns);
  const overdue = getOverdue(txns);
  const walletBalance = revenue - overdue;
  const chartData = getMonthlyRevenue(txns);

  const validate = () => {
    const e: Partial<typeof emptyForm> = {};
    if (!form.client.trim() && !form.clientId) e.client = "Client is required";
    if (!form.amount || Number(form.amount) <= 0) e.amount = "Enter a valid amount";
    if (!form.date) e.date = "Date is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const clientLabel = clients.find((c) => c.id === form.clientId)?.clientName || form.client;
    if (editId) {
      updateTransaction(editId, {
        client: clientLabel, clientId: form.clientId,
        amount: Number(form.amount), type: form.type,
        status: form.status, date: form.date,
        dueDate: form.dueDate || undefined, note: form.note || undefined,
      });
    } else {
      addTransaction({
        client: clientLabel, clientId: form.clientId,
        amount: Number(form.amount), type: form.type,
        status: form.status, date: form.date,
        dueDate: form.dueDate || undefined, note: form.note || undefined,
      });
    }
    refresh();
    closeForm();
  };

  const openAdd = () => {
    setEditId(null);
    setForm(emptyForm);
    setErrors({});
    setIsOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setEditId(t.id);
    setForm({
      clientId: t.clientId, client: t.client,
      amount: String(t.amount), type: t.type,
      status: t.status, date: t.date,
      dueDate: t.dueDate ?? "", note: t.note ?? "",
    });
    setErrors({});
    setIsOpen(true);
  };

  const closeForm = () => { setIsOpen(false); setEditId(null); setForm(emptyForm); setErrors({}); };

  const set = (k: keyof typeof emptyForm) => (val: string) =>
    setForm((f) => ({ ...f, [k]: val }));

  const overdueList = txns.filter((t) => t.status === "overdue").slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Finance</h1>
          <p className="text-muted-foreground mt-1">Financial operations and wallet management</p>
        </div>
        <Can permission={Permission.WALLET__RECORD_PAYMENT}>
          <Button className="gap-2" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
        </Can>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: `₹${revenue.toLocaleString()}`, icon: TrendingUp, color: "text-green-500" },
          { label: "Wallet Balance", value: `₹${walletBalance.toLocaleString()}`, icon: Wallet, color: "text-blue-500" },
          { label: "Pending Payments", value: `₹${pending.toLocaleString()}`, icon: DollarSign, color: "text-yellow-500" },
          { label: "Overdue", value: `₹${overdue.toLocaleString()}`, icon: AlertCircle, color: "text-red-500" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Revenue Trend */}
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Revenue Trend (Last 12 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorRevenue2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 12 }} tickFormatter={(v) => `₹${v.toLocaleString()}`} />
              <Tooltip formatter={(v: number) => [`₹${v.toLocaleString()}`, "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2}
                fillOpacity={1} fill="url(#colorRevenue2)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>All Transactions</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2 text-muted-foreground" />
                <Input
                  placeholder="Search client, ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs w-48"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-32">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {TXN_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No transactions found. Click "Add Transaction" to record one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                    <TableCell className="font-medium">{t.client}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 capitalize">
                        {TYPE_ICON[t.type]} {t.type}
                      </div>
                    </TableCell>
                    <TableCell className={`font-semibold ${t.type === "refund" ? "text-orange-500" : "text-green-600"}`}>
                      {t.type === "refund" ? "-" : "+"}₹{t.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[t.status]} className="capitalize text-xs">{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{t.date}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{t.note || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(t)}>Edit</Button>
                        <Can permission={Permission.WALLET__MANAGE}>
                          <Button variant="ghost" size="sm" className="h-7 text-destructive hover:text-destructive"
                            onClick={() => { deleteTransaction(t.id); refresh(); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Can>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Overdue Payments */}
      {overdueList.length > 0 && (
        <Card className="shadow-md border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Overdue Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueList.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-4 border rounded-lg border-destructive/20 bg-destructive/5">
                  <div>
                    <p className="font-medium">{t.client}</p>
                    <p className="text-xs text-muted-foreground">{t.id} · Due: {t.dueDate || t.date}</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <p className="font-bold text-destructive">₹{t.amount.toLocaleString()}</p>
                    <Can permission={Permission.WALLET__MONITOR_OVERDUE}>
                      <Button variant="outline" size="sm"
                        onClick={() => { updateTransaction(t.id, { status: "paid" }); refresh(); }}>
                        Mark Paid
                      </Button>
                    </Can>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={isOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Transaction" : "Add Transaction"}</DialogTitle>
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
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.clientName}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.client && <p className="text-xs text-destructive">{errors.client}</p>}
            </div>

            {/* Amount */}
            <div className="space-y-1.5">
              <Label>Amount (₹) <span className="text-destructive">*</span></Label>
              <Input type="number" min="1" value={form.amount}
                onChange={(e) => set("amount")(e.target.value)} placeholder="0" />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>

            {/* Type + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={set("type")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TXN_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={set("status")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TXN_STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date + Due Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date <span className="text-destructive">*</span></Label>
                <Input type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} />
                {errors.date && <p className="text-xs text-destructive">{errors.date}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
              </div>
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Input value={form.note} onChange={(e) => set("note")(e.target.value)} placeholder="Optional note" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={closeForm}>Cancel</Button>
            <Button className="flex-1" onClick={handleSubmit}>{editId ? "Save Changes" : "Submit"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}