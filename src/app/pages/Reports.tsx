import { useState, useMemo } from "react";
import {
  Download, Calendar, TrendingUp, DollarSign,
  ArrowUpCircle, ArrowDownCircle, Target, TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge } from "../components/ui/badge";
import {
  BarChart, Bar, AreaChart, Area, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import {
  loadTransactions, getTotalRevenue, getPending, getOverdue, getMonthlyRevenue,
  type Transaction,
} from "../../lib/transactionStore";

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function getMonthlyProfit(txns: Transaction[]) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    const revenue = txns
      .filter((t) => {
        if (t.status !== "paid" || t.type === "refund") return false;
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      })
      .reduce((s, t) => s + t.amount, 0);
    const expenses = txns
      .filter((t) => {
        if (t.type !== "refund") return false;
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      })
      .reduce((s, t) => s + t.amount, 0);
    return { month: label, revenue, expenses, profit: revenue - expenses };
  });
}

function getExpectedSalesData(txns: Transaction[]) {
  const now = new Date();

  // Last 6 months of actuals
  const historical = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    const revenue = txns
      .filter((t) => {
        if (t.status !== "paid" || t.type === "refund") return false;
        const td = new Date(t.date);
        return td.getFullYear() === d.getFullYear() && td.getMonth() === d.getMonth();
      })
      .reduce((s, t) => s + t.amount, 0);
    return { month: label, actual: revenue, expected: null as number | null };
  });

  // Average of non-zero months
  const nonZero = historical.filter((r) => r.actual > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((s, r) => s + r.actual, 0) / nonZero.length : 0;

  // Month-over-month growth rate (last 3 months)
  const growthSamples = historical.slice(-4);
  let growthRate = 1.05; // default 5%
  if (growthSamples.length >= 2) {
    const rates: number[] = [];
    for (let i = 1; i < growthSamples.length; i++) {
      const prev = growthSamples[i - 1].actual;
      const curr = growthSamples[i].actual;
      if (prev > 0) rates.push(curr / prev);
    }
    if (rates.length > 0) {
      const avgRate = rates.reduce((s, r) => s + r, 0) / rates.length;
      growthRate = Math.min(Math.max(avgRate, 0.9), 1.3); // clamp between -10% and +30%
    }
  }

  // Next 3 months projected
  const projected = Array.from({ length: 3 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    return {
      month: label,
      actual: null as number | null,
      expected: Math.round(avg * Math.pow(growthRate, i + 1)),
    };
  });

  return { data: [...historical, ...projected], avg, growthRate };
}

function exportCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]).join(",");
  const body = rows.map((r) => Object.values(r).join(",")).join("\n");
  const blob = new Blob([`${headers}\n${body}`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Reports() {
  const [txns] = useState<Transaction[]>(() => loadTransactions());

  const revenue   = getTotalRevenue(txns);
  const pending   = getPending(txns);
  const overdue   = getOverdue(txns);
  const refunds   = txns.filter((t) => t.type === "refund").reduce((s, t) => s + t.amount, 0);
  const netProfit = revenue - refunds;
  const profitMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0.0";

  const monthlyRevenue = useMemo(() => getMonthlyRevenue(txns), [txns]);
  const monthlyProfit  = useMemo(() => getMonthlyProfit(txns), [txns]);
  const { data: expectedData, avg: historicalAvg, growthRate } = useMemo(
    () => getExpectedSalesData(txns),
    [txns],
  );

  const paidTxns = [...txns]
    .filter((t) => t.status === "paid")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const nextMonthExpected = expectedData.find((r) => r.actual === null && r.expected !== null)?.expected ?? 0;
  const nextQtrExpected   = expectedData
    .filter((r) => r.actual === null && r.expected !== null)
    .reduce((s, r) => s + (r.expected ?? 0), 0);
  const growthPct = ((growthRate - 1) * 100).toFixed(1);
  const isPositiveGrowth = growthRate >= 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Reports & Analytics</h1>
          <p className="text-muted-foreground mt-1">Generate and export business reports</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Date Range
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => exportCSV("all-reports", monthlyProfit as Record<string, unknown>[])}
          >
            <Download className="h-4 w-4" />
            Export All
          </Button>
        </div>
      </div>

      <Tabs defaultValue="sales">
        <TabsList>
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="profit">Profit Report</TabsTrigger>
          <TabsTrigger value="expected">Expected Sales Report</TabsTrigger>
        </TabsList>

        {/* ──────────── SALES REPORT ──────────── */}
        <TabsContent value="sales" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-md">
              <CardContent className="p-6">
                <DollarSign className="h-5 w-5 text-secondary mb-2" />
                <p className="text-2xl font-bold">{fmt(revenue)}</p>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <TrendingUp className="h-5 w-5 text-green-500 mb-2" />
                <p className="text-2xl font-bold">{txns.filter((t) => t.status === "paid").length}</p>
                <p className="text-sm text-muted-foreground">Paid Transactions</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <ArrowUpCircle className="h-5 w-5 text-yellow-500 mb-2" />
                <p className="text-2xl font-bold">{fmt(pending)}</p>
                <p className="text-sm text-muted-foreground">Pending Payments</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <ArrowDownCircle className="h-5 w-5 text-red-500 mb-2" />
                <p className="text-2xl font-bold">{fmt(overdue)}</p>
                <p className="text-sm text-muted-foreground">Overdue Payments</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Monthly Revenue (Last 12 Months)</CardTitle>
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => exportCSV("sales-report", monthlyRevenue as Record<string, unknown>[])}
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={monthlyRevenue}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [fmt(v), "Revenue"]} />
                  <Area
                    type="monotone" dataKey="revenue" stroke="#10b981"
                    strokeWidth={2} fill="url(#gradRevenue)" name="Revenue"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader><CardTitle>Recent Paid Transactions</CardTitle></CardHeader>
            <CardContent>
              {paidTxns.length === 0 ? (
                <p className="text-center text-muted-foreground py-10">No paid transactions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paidTxns.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-mono text-xs">{t.id}</TableCell>
                        <TableCell>{t.client}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{t.type}</Badge>
                        </TableCell>
                        <TableCell>{t.date}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">{fmt(t.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────────── PROFIT REPORT ──────────── */}
        <TabsContent value="profit" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-md">
              <CardContent className="p-6">
                <DollarSign className="h-5 w-5 text-secondary mb-2" />
                <p className="text-2xl font-bold">{fmt(revenue)}</p>
                <p className="text-sm text-muted-foreground">Gross Revenue</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <ArrowUpCircle className="h-5 w-5 text-red-500 mb-2" />
                <p className="text-2xl font-bold">{fmt(refunds)}</p>
                <p className="text-sm text-muted-foreground">Refunds / Credits</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <TrendingUp className="h-5 w-5 text-green-500 mb-2" />
                <p className="text-2xl font-bold">{fmt(netProfit)}</p>
                <p className="text-sm text-muted-foreground">Net Profit</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <Target className="h-5 w-5 text-blue-500 mb-2" />
                <p className="text-2xl font-bold">{profitMargin}%</p>
                <p className="text-sm text-muted-foreground">Profit Margin</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Monthly Revenue &amp; Profit (Last 12 Months)</CardTitle>
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => exportCSV("profit-report", monthlyProfit as Record<string, unknown>[])}
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={monthlyProfit}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                  <Legend />
                  <Bar dataKey="revenue"  fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue"    isAnimationActive={false} />
                  <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Refunds"    isAnimationActive={false} />
                  <Bar dataKey="profit"   fill="#6366f1" radius={[4, 4, 0, 0]} name="Net Profit" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader><CardTitle>Monthly Breakdown</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Refunds</TableHead>
                    <TableHead className="text-right">Net Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyProfit.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right text-green-600">{fmt(row.revenue)}</TableCell>
                      <TableCell className="text-right text-red-500">{fmt(row.expenses)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(row.profit)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={row.profit >= 0 ? "default" : "destructive"}>
                          {row.revenue > 0
                            ? `${((row.profit / row.revenue) * 100).toFixed(1)}%`
                            : "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ──────────── EXPECTED SALES REPORT ──────────── */}
        <TabsContent value="expected" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="shadow-md">
              <CardContent className="p-6">
                <Target className="h-5 w-5 text-secondary mb-2" />
                <p className="text-2xl font-bold">{fmt(nextMonthExpected)}</p>
                <p className="text-sm text-muted-foreground">Expected Next Month</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <TrendingUp className="h-5 w-5 text-blue-500 mb-2" />
                <p className="text-2xl font-bold">{fmt(nextQtrExpected)}</p>
                <p className="text-sm text-muted-foreground">Expected Next Quarter</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                <DollarSign className="h-5 w-5 text-green-500 mb-2" />
                <p className="text-2xl font-bold">{fmt(Math.round(historicalAvg))}</p>
                <p className="text-sm text-muted-foreground">Avg Monthly Sales</p>
              </CardContent>
            </Card>
            <Card className="shadow-md">
              <CardContent className="p-6">
                {isPositiveGrowth
                  ? <TrendingUp className="h-5 w-5 text-green-500 mb-2" />
                  : <TrendingDown className="h-5 w-5 text-red-500 mb-2" />}
                <p className={`text-2xl font-bold ${isPositiveGrowth ? "text-green-600" : "text-red-500"}`}>
                  {isPositiveGrowth ? "+" : ""}{growthPct}%
                </p>
                <p className="text-sm text-muted-foreground">Projected Growth</p>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-md">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Actual vs Projected Sales</CardTitle>
                <Button
                  variant="outline" size="sm" className="gap-2"
                  onClick={() => exportCSV("expected-sales-report", expectedData as Record<string, unknown>[])}
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Last 6 months actuals + next 3 months projection (based on historical trend)
              </p>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={expectedData}>
                  <defs>
                    <linearGradient id="gradActual" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number, name: string) => [fmt(v), name]} />
                  <Legend />
                  <Line
                    type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={2.5}
                    dot={{ r: 4 }} name="Actual Sales" connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone" dataKey="expected" stroke="#6366f1" strokeWidth={2.5}
                    strokeDasharray="6 3" dot={{ r: 4, fill: "#6366f1" }}
                    name="Projected Sales" connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader><CardTitle>Projection Details</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Actual Sales</TableHead>
                    <TableHead className="text-right">Projected Sales</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expectedData.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell className="font-medium">{row.month}</TableCell>
                      <TableCell className="text-right">
                        {row.actual !== null ? fmt(row.actual) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-indigo-600">
                        {row.expected !== null ? fmt(row.expected) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.actual !== null ? (
                          <Badge variant="default">Actual</Badge>
                        ) : (
                          <Badge variant="secondary">Projected</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}