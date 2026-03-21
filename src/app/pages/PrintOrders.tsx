import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Printer, Filter, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { fetchTemplateOrders, type TemplateOrderRecord } from "../../lib/orderApi";
import { loadProjects, loadProjectProducts } from "../../lib/projectStore";

type RowOrder = {
  id: string;
  client: string;
  project: string;
  status: string;
  priority: string;
  qty: number;
  createdAt: string;
  source: "project" | "api";
  projectId?: string;
};

function parseDateValue(value: string): number {
  if (!value) return Number.NaN;
  const parsed = new Date(value).getTime();
  if (!Number.isNaN(parsed)) return parsed;

  const parts = value.split("/");
  if (parts.length === 3) {
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = Number(parts[2]);
    if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
      return new Date(year, month - 1, day).getTime();
    }
  }
  return Number.NaN;
}

export function PrintOrders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<TemplateOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<RowOrder | null>(null);

  useEffect(() => {
    let mounted = true;
    const loadOrders = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await fetchTemplateOrders();
        if (mounted) {
          setOrders(data);
        }
      } catch (err) {
        if (mounted) {
          setError((err as Error).message || "Failed to load print orders");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadOrders();
    return () => {
      mounted = false;
    };
  }, []);

  const apiRows: RowOrder[] = useMemo(() => {
    return orders.map((order) => {
      const projectName =
        typeof order.productId === "object" && order.productId !== null
          ? String((order.productId as any).name || (order.productId as any)._id || "-")
          : String(order.productId || "-");

      return {
        id: order._id,
        client: order.userId || "Guest/User",
        project: projectName,
        status: order.status,
        priority: order.quantity >= 100 ? "high" : "normal",
        qty: order.quantity,
        createdAt: order.createdAt,
        source: "api",
      };
    });
  }, [orders]);

  const projectRows: RowOrder[] = useMemo(() => {
    return loadProjects()
      .filter((project) => ["printing", "dispatched", "delivered"].includes(project.stage))
      .map((project) => {
        const products = loadProjectProducts(project.id);
        const totalQty = products.reduce((sum, product) => sum + product.quantity, 0);
        const status =
          project.stage === "printing"
            ? "processing"
            : project.stage === "dispatched" || project.stage === "delivered"
              ? "completed"
              : "pending";

        return {
          id: project.id,
          client: project.client || "Guest/User",
          project: project.name,
          status,
          priority: project.priority === "urgent" || project.priority === "high" ? "high" : "normal",
          qty: totalQty,
          createdAt: project.createdAt,
          source: "project",
          projectId: project.id,
        };
      });
  }, []);

  const rows: RowOrder[] = useMemo(() => {
    const merged = [...projectRows, ...apiRows];
    const seen = new Set<string>();
    return merged.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });
  }, [projectRows, apiRows]);

  const filteredRows = useMemo(() => {
    const fromTs = fromDate ? new Date(fromDate).setHours(0, 0, 0, 0) : null;
    const toTs = toDate ? new Date(toDate).setHours(23, 59, 59, 999) : null;

    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }
      if (priorityFilter !== "all" && row.priority !== priorityFilter) {
        return false;
      }

      const rowTs = parseDateValue(row.createdAt);
      if (Number.isNaN(rowTs)) {
        return !fromTs && !toTs;
      }
      if (fromTs !== null && rowTs < fromTs) {
        return false;
      }
      if (toTs !== null && rowTs > toTs) {
        return false;
      }
      return true;
    });
  }, [rows, statusFilter, priorityFilter, fromDate, toDate]);

  const stats = useMemo(() => {
    const total = filteredRows.length;
    const printing = filteredRows.filter((o) => o.status === "processing").length;
    const queued = filteredRows.filter((o) => o.status === "pending").length;
    const completed = filteredRows.filter((o) => o.status === "completed").length;
    return { total, printing, queued, completed };
  }, [filteredRows]);

  const handleExport = () => {
    if (filteredRows.length === 0) return;
    const header = ["Order ID", "Client", "Project", "Status", "Priority", "Quantity"];
    const csvRows = [
      header.join(","),
      ...filteredRows.map((r) => [r.id, r.client, r.project, r.status, r.priority, r.qty].join(",")),
    ];
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `print-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPriorityFilter("all");
    setFromDate("");
    setToDate("");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Print Orders</h1>
          <p className="text-muted-foreground mt-1">Manage and track print orders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowFilters((prev) => !prev)}>
            <Filter className="h-4 w-4" />
            {showFilters ? "Hide Filters" : "Filter"}
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            disabled={filteredRows.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showFilters && (
        <Card className="shadow-md">
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              aria-label="From date"
            />
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              aria-label="To date"
            />

            <Button variant="secondary" onClick={clearFilters}>
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Orders", value: stats.total },
          { label: "Printing", value: stats.printing },
          { label: "Queued", value: stats.queued },
          { label: "Completed", value: stats.completed },
        ].map((item, i) => (
          <Card key={i} className="shadow-md">
            <CardContent className="p-6">
              <Printer className="h-5 w-5 text-secondary mb-2" />
              <p className="text-2xl font-bold">{item.value}</p>
              <p className="text-sm text-muted-foreground">{item.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Print Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    Loading orders...
                  </TableCell>
                </TableRow>
              ) : filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No print orders match the selected filters.
                  </TableCell>
                </TableRow>
              ) : filteredRows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell>{order.client}</TableCell>
                  <TableCell>{order.project}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{order.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.priority === "high" ? "destructive" : "outline"}>
                      {order.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{order.qty}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedOrder(order)}>
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Print Order Details</DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <p className="text-muted-foreground">Order ID</p>
                <p className="font-medium break-all">{selectedOrder.id}</p>
                <p className="text-muted-foreground">Client</p>
                <p>{selectedOrder.client}</p>
                <p className="text-muted-foreground">Project</p>
                <p>{selectedOrder.project}</p>
                <p className="text-muted-foreground">Status</p>
                <p className="capitalize">{selectedOrder.status}</p>
                <p className="text-muted-foreground">Priority</p>
                <p className="capitalize">{selectedOrder.priority}</p>
                <p className="text-muted-foreground">Quantity</p>
                <p>{selectedOrder.qty}</p>
                <p className="text-muted-foreground">Created At</p>
                <p>{selectedOrder.createdAt || "-"}</p>
                <p className="text-muted-foreground">Source</p>
                <p className="capitalize">{selectedOrder.source}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                {selectedOrder.source === "project" && selectedOrder.projectId && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigate(`/projects/${selectedOrder.projectId}`);
                      setSelectedOrder(null);
                    }}
                  >
                    Open Project
                  </Button>
                )}
                <Button onClick={() => setSelectedOrder(null)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
