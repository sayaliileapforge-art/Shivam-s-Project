import { useState, useEffect } from "react";
import { Plus, Search, CheckSquare, Clock, AlertCircle, CheckCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Textarea } from "../components/ui/textarea";
import {
  type ProjectTask as Task,
  loadProjectTasks,
  addProjectTask,
  updateProjectTask,
  deleteProjectTask,
  loadProjects,
  type Project,
} from "../../lib/projectStore";
import { loadStaff, type StaffMember } from "../../lib/staffStore";

const STORAGE_KEY = "vendor_project_tasks";

function loadAllTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Task[]) : [];
  } catch { return []; }
}

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "urgent": return <Badge variant="destructive">Urgent</Badge>;
    case "high":   return <Badge className="bg-orange-500 text-white">High</Badge>;
    case "medium": return <Badge variant="secondary">Medium</Badge>;
    default:       return <Badge variant="outline">Low</Badge>;
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "done":        return <Badge className="bg-success text-success-foreground">Done</Badge>;
    case "in-progress": return <Badge className="bg-info text-info-foreground">In Progress</Badge>;
    default:            return <Badge variant="secondary">Pending</Badge>;
  }
};

export function ProjectTask() {
  const [tasks, setTasks]           = useState<Task[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [staff, setStaff]           = useState<StaffMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // form state
  const [title, setTitle]         = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignee, setAssignee]   = useState("");
  const [priority, setPriority]   = useState<"urgent"|"high"|"medium"|"low">("medium");
  const [status, setStatus]       = useState<"pending"|"in-progress"|"done">("pending");
  const [dueDate, setDueDate]     = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    setTasks(loadAllTasks());
    setProjects(loadProjects());
    setStaff(loadStaff());
  }, []);

  const filtered = tasks.filter((t) => {
    const proj = projects.find((p) => p.id === t.projectId);
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.assignee.toLowerCase().includes(q) ||
      (proj?.name ?? "").toLowerCase().includes(q)
    );
  });

  const counts = {
    total:      tasks.length,
    inProgress: tasks.filter((t) => t.status === "in-progress").length,
    pending:    tasks.filter((t) => t.status === "pending").length,
    done:       tasks.filter((t) => t.status === "done").length,
  };

  function handleAdd() {
    if (!title.trim()) return;
    const newTask = addProjectTask({
      projectId: projectId || "none",
      title: title.trim(),
      assignee,
      dueDate,
      status,
    });
    setTasks((prev) => [...prev, newTask]);
    // reset
    setTitle(""); setProjectId(""); setAssignee(""); setPriority("medium");
    setStatus("pending"); setDueDate(""); setDescription("");
    setIsAddDialogOpen(false);
  }

  function handleDelete(id: string) {
    deleteProjectTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  function handleStatusChange(id: string, newStatus: "pending"|"in-progress"|"done") {
    updateProjectTask(id, { status: newStatus });
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: newStatus } : t));
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Project Tasks</h1>
          <p className="text-muted-foreground mt-1">Track and manage all project tasks</p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" />Add Task</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Add New Task</DialogTitle></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Task Title</Label>
                <Input placeholder="Enter task title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger><SelectValue placeholder="Assign to" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unassigned">Unassigned</SelectItem>
                      {staff.map((s) => <SelectItem key={s.id} value={s.fullName}>{s.fullName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                    <SelectTrigger><SelectValue placeholder="Select priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Due Date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Task description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!title.trim()}>Add Task</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: "Total Tasks",  count: counts.total,      icon: CheckSquare, color: "text-secondary" },
          { label: "In Progress",  count: counts.inProgress, icon: Clock,       color: "text-warning"   },
          { label: "Pending",      count: counts.pending,    icon: AlertCircle, color: "text-info"      },
          { label: "Completed",    count: counts.done,       icon: CheckCircle, color: "text-success"   },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className="shadow-md">
              <CardContent className="p-6">
                <Icon className={`h-5 w-5 ${stat.color} mb-2`} />
                <p className="text-2xl font-bold">{stat.count}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search tasks..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card className="shadow-md">
        <CardHeader><CardTitle>All Tasks</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-12 text-center">
              <CheckSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No tasks yet. Add a task to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((task) => {
                  const proj = projects.find((p) => p.id === task.projectId);
                  return (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.id}</TableCell>
                      <TableCell>{task.title}</TableCell>
                      <TableCell>{proj?.name ?? "—"}</TableCell>
                      <TableCell>{task.assignee || "Unassigned"}</TableCell>
                      <TableCell>{getStatusBadge(task.status)}</TableCell>
                      <TableCell>{task.dueDate || "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Select
                            value={task.status}
                            onValueChange={(v) => handleStatusChange(task.id, v as Task["status"])}
                          >
                            <SelectTrigger className="h-7 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in-progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(task.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
