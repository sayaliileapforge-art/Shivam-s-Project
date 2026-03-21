import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Users,
  FolderKanban,
  AlertCircle,
  Printer,
  DollarSign,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Plus,
  Upload,
  FileText,
  ArrowUpRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";
import { type Client } from "../../lib/clientStore";
import { type Project } from "../../lib/projectStore";
import { fetchClients, fetchProjects } from "../../lib/apiService";
import { fetchTemplateOrders } from "../../lib/orderApi";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

type DashboardStat = {
  title: string;
  value: string;
  change: string;
  trend: "up" | "down";
  icon: typeof Users;
  color: string;
  bgColor: string;
  href: string;
};

type ActivityItem = {
  id: number;
  type: string;
  title: string;
  client: string;
  time: string;
  badge: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
  amount?: string;
};

const parseDate = (value?: string): Date | null => {
  if (!value) return null;

  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;

  const parts = value.split(/[\/-]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const pctChange = (current: number, previous: number): { change: string; trend: "up" | "down" } => {
  if (previous <= 0) {
    if (current <= 0) return { change: "0%", trend: "up" };
    return { change: "100%", trend: "up" };
  }

  const delta = ((current - previous) / previous) * 100;
  return {
    change: `${Math.abs(delta).toFixed(0)}%`,
    trend: delta >= 0 ? "up" : "down",
  };
};

const mapApiProjectToUi = (p: any): Project => {
  const populatedClient = typeof p.clientId === "object" && p.clientId !== null ? p.clientId : null;
  const stage = String(p.stage || p.status || "draft");

  return {
    id: String(p._id || p.id),
    name: String(p.name || "Untitled Project"),
    client: String(p.client || populatedClient?.clientName || "Unknown Client"),
    clientId: String(populatedClient?._id || p.clientId || ""),
    stage,
    priority: (p.priority || "medium") as Project["priority"],
    dueDate: String(p.dueDate || ""),
    assignee: String(p.assignee || ""),
    amount: Number(p.amount || 0),
    description: String(p.description || ""),
    workflowType: (p.workflowType || "variable_data") as Project["workflowType"],
    createdAt: String(p.createdAt || new Date().toISOString()),
  };
};

const quickActions = [
  { label: "Create Project", icon: Plus, link: "/projects", variant: "default" as const, permission: Permission.PROJECTS__CREATE },
  { label: "Add Client", icon: Users, link: "/clients", variant: "secondary" as const, permission: Permission.CLIENTS__CREATE },
  { label: "Upload Data", icon: Upload, link: "/data-processing", variant: "outline" as const, permission: Permission.DATA__UPLOAD_EXCEL },
  { label: "Generate Quote", icon: FileText, link: "/products", variant: "outline" as const, permission: Permission.QUOTES__GENERATE },
];

export function Dashboard() {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [printingOrdersCount, setPrintingOrdersCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      fetchClients(),
      fetchProjects(),
      fetchTemplateOrders().catch(() => []),
    ])
      .then(([apiClients, apiProjects, templateOrders]) => {
        if (!mounted) return;

        const mappedClients = Array.isArray(apiClients)
          ? apiClients.map((c: any) => ({ ...c, id: String(c._id || c.id) }))
          : [];

        const mappedProjects = Array.isArray(apiProjects)
          ? apiProjects.map(mapApiProjectToUi)
          : [];

        const activePrinting = Array.isArray(templateOrders)
          ? templateOrders.filter((o) => o.status === "processing").length
          : 0;

        setClients(mappedClients);
        setProjects(mappedProjects);
        setPrintingOrdersCount(activePrinting);
      })
      .catch(() => {
        if (!mounted) return;
        setClients([]);
        setProjects([]);
        setPrintingOrdersCount(0);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo<DashboardStat[]>(() => {
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    const clientsRecent = clients.filter((c) => {
      const d = parseDate(c.createdAt);
      return d ? now - d.getTime() <= sevenDays : false;
    }).length;
    const clientsPrev = clients.filter((c) => {
      const d = parseDate(c.createdAt);
      if (!d) return false;
      const age = now - d.getTime();
      return age > sevenDays && age <= sevenDays * 2;
    }).length;

    const activeProjectsCount = projects.filter((p) => p.stage !== "delivered").length;
    const projectRecent = projects.filter((p) => {
      const d = parseDate(p.createdAt);
      return d ? now - d.getTime() <= sevenDays : false;
    }).length;
    const projectPrev = projects.filter((p) => {
      const d = parseDate(p.createdAt);
      if (!d) return false;
      const age = now - d.getTime();
      return age > sevenDays && age <= sevenDays * 2;
    }).length;

    const pendingApprovals = projects.filter((p) => p.stage === "proof-sent").length;
    const printingOrders = printingOrdersCount;
    const paymentsDue = projects
      .filter((p) => p.stage !== "delivered")
      .reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0);
    // Complaints are not yet backed by API in this project.
    const openComplaints = 0;

    const clientTrend = pctChange(clientsRecent, clientsPrev);
    const projectTrend = pctChange(projectRecent, projectPrev);

    return [
      {
        title: "Total Clients",
        value: String(clients.length),
        change: clientTrend.change,
        trend: clientTrend.trend,
        icon: Users,
        color: "text-secondary",
        bgColor: "bg-secondary/10",
        href: "/clients",
      },
      {
        title: "Active Projects",
        value: String(activeProjectsCount),
        change: projectTrend.change,
        trend: projectTrend.trend,
        icon: FolderKanban,
        color: "text-accent",
        bgColor: "bg-accent/10",
        href: "/projects",
      },
      {
        title: "Pending Approvals",
        value: String(pendingApprovals),
        change: "0%",
        trend: "down",
        icon: AlertCircle,
        color: "text-warning",
        bgColor: "bg-warning/10",
        href: "/projects",
      },
      {
        title: "Orders Printing",
        value: String(printingOrders),
        change: "0%",
        trend: "up",
        icon: Printer,
        color: "text-info",
        bgColor: "bg-info/10",
        href: "/print-orders",
      },
      {
        title: "Payments Due",
        value: `₹${paymentsDue.toLocaleString("en-IN")}`,
        change: "0%",
        trend: "up",
        icon: DollarSign,
        color: "text-success",
        bgColor: "bg-success/10",
        href: "/finance",
      },
      {
        title: "Open Complaints",
        value: String(openComplaints),
        change: "0%",
        trend: openComplaints > 0 ? "up" : "down",
        icon: MessageSquare,
        color: "text-destructive",
        bgColor: "bg-destructive/10",
        href: "/complaints",
      },
    ];
  }, [clients, printingOrdersCount, projects]);

  const revenueData = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = new Date();
      date.setMonth(date.getMonth() - (5 - i));
      return {
        key: `${date.getFullYear()}-${date.getMonth()}`,
        month: date.toLocaleString("en-IN", { month: "short" }),
        revenue: 0,
        orders: 0,
      };
    });

    for (const project of projects) {
      const d = parseDate(project.createdAt);
      if (!d) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const target = months.find((m) => m.key === key);
      if (!target) continue;
      target.revenue += Number(project.amount) || 0;
      target.orders += 1;
    }

    return months.map(({ month, revenue, orders }) => ({ month, revenue, orders }));
  }, [projects]);

  const productionData = useMemo(
    () => [
      { stage: "Draft", count: projects.filter((p) => p.stage === "draft").length },
      { stage: "Design", count: projects.filter((p) => p.stage === "designing").length },
      { stage: "Proof", count: projects.filter((p) => p.stage === "proof-sent").length },
      { stage: "Print", count: projects.filter((p) => p.stage === "printing").length },
      { stage: "Done", count: projects.filter((p) => p.stage === "delivered").length },
    ],
    [projects]
  );

  const staffPerformance = useMemo(() => {
    const byAssignee = new Map<string, number>();
    for (const project of projects) {
      const assignee = project.assignee?.trim() || "Unassigned";
      byAssignee.set(assignee, (byAssignee.get(assignee) ?? 0) + 1);
    }
    return Array.from(byAssignee.entries())
      .map(([name, projectCount]) => ({
        name,
        projects: projectCount,
        target: Math.max(projectCount + 1, 3),
      }))
      .sort((a, b) => b.projects - a.projects)
      .slice(0, 5);
  }, [projects]);

  const projectStatusData = useMemo(() => {
    const completed = projects.filter((p) => p.stage === "delivered").length;
    const printing = projects.filter((p) => p.stage === "printing").length;
    const approvals = projects.filter((p) => p.stage === "proof-sent").length;
    const inProgress = projects.filter((p) => !["delivered", "printing", "proof-sent"].includes(p.stage)).length;

    return [
      { name: "Completed", value: completed, color: "#10b981" },
      { name: "Printing", value: printing, color: "#3b82f6" },
      { name: "Awaiting Approval", value: approvals, color: "#f59e0b" },
      { name: "In Progress", value: inProgress, color: "#8b5cf6" },
    ].filter((item) => item.value > 0);
  }, [projects]);

  const activities = useMemo<ActivityItem[]>(() => {
    return [...projects]
      .sort((a, b) => {
        const ad = parseDate(a.createdAt)?.getTime() ?? 0;
        const bd = parseDate(b.createdAt)?.getTime() ?? 0;
        return bd - ad;
      })
      .slice(0, 6)
      .map((project, index) => ({
        id: index + 1,
        type: "project",
        title: `${project.name} updated`,
        client: project.client,
        time: project.createdAt,
        badge: project.stage,
        badgeVariant: project.stage === "delivered" ? "default" : "secondary",
        amount: `₹${(project.amount ?? 0).toLocaleString("en-IN")}`,
      }));
  }, [projects]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Here's what's happening today.
          </p>
        </div>
        <div className="flex gap-2">
          {quickActions.map((action) => (
            <Can key={action.label} permission={action.permission}>
              <Link to={action.link}>
                <Button variant={action.variant} className="gap-2">
                  <action.icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{action.label}</span>
                </Button>
              </Link>
            </Can>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Link key={stat.title} to={stat.href} className="block">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer hover:border-primary/40">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                      <Icon className={`h-5 w-5 ${stat.color}`} />
                    </div>
                    <div
                      className={`flex items-center gap-1 text-xs ${
                        stat.trend === "up" ? "text-success" : "text-destructive"
                      }`}
                    >
                      {stat.trend === "up" ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {stat.change}
                    </div>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-sm text-muted-foreground mt-1">{stat.title}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Revenue Analytics</CardTitle>
              <Link to="/finance">
                <Button variant="ghost" size="sm" className="gap-1">
                  View Details
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Production Pipeline */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Production Pipeline</CardTitle>
              <Link to="/projects">
                <Button variant="ghost" size="sm" className="gap-1">
                  View Details
                  <ArrowUpRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={productionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="stage" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[8, 8, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Staff Performance */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Staff Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={staffPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" stroke="#64748b" />
                <YAxis dataKey="name" type="category" stroke="#64748b" />
                <Tooltip />
                <Legend />
                <Bar dataKey="projects" fill="#14b8a6" radius={[0, 8, 8, 0]} isAnimationActive={false} />
                <Bar dataKey="target" fill="#f59e0b" radius={[0, 8, 8, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Project Status Distribution */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Project Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={projectStatusData.length ? projectStatusData : [{ name: "No Data", value: 1, color: "#cbd5e1" }]}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) =>
                      `${name}: ${(percent * 100).toFixed(0)}%`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                    isAnimationActive={false}
                  >
                    {(projectStatusData.length ? projectStatusData : [{ name: "No Data", value: 1, color: "#cbd5e1" }]).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card className="shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Activity</CardTitle>
            <Link to="/projects">
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-4 p-4 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-foreground">{activity.title}</p>
                    <Badge variant={activity.badgeVariant}>{activity.badge}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {activity.client}
                    {activity.amount && (
                      <span className="font-medium text-success ml-2">
                        {activity.amount}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activity.time}
                  </p>
                </div>
                <Button variant="ghost" size="sm">
                  View
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}