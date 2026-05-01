import { useEffect, useState } from "react";
import { Link } from "react-router";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import {
  Plus,
  Search,
  Filter,
  LayoutGrid,
  List,
  Clock,
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  Eye,
  Edit,
  Trash2,
  Calendar,
  FolderKanban,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { ScrollArea, ScrollBar } from "../components/ui/scroll-area";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Can } from "../../lib/rbac";
import { Permission } from "../../lib/rbac";
import {
  type Project,
} from "../../lib/projectStore";
import { loadClients, type Client } from "../../lib/clientStore";
import {
  fetchProjects as apiFetchProjects,
  createProject as apiCreateProject,
  updateProject as apiUpdateProject,
  deleteProject as apiDeleteProject,
} from "../../lib/apiService";

const stages = [
  { id: "draft", name: "Draft", color: "bg-gray-100 border-gray-300" },
  { id: "data-uploaded", name: "Data Uploaded", color: "bg-blue-100 border-blue-300" },
  { id: "designing", name: "Designing", color: "bg-purple-100 border-purple-300" },
  { id: "proof-sent", name: "Proof Sent", color: "bg-yellow-100 border-yellow-300" },
  { id: "approved", name: "Approved", color: "bg-green-100 border-green-300" },
  { id: "printing", name: "Printing", color: "bg-orange-100 border-orange-300" },
  { id: "dispatched", name: "Dispatched", color: "bg-teal-100 border-teal-300" },
  { id: "delivered", name: "Delivered", color: "bg-emerald-100 border-emerald-300" },
];

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "urgent": return <Badge variant="destructive">Urgent</Badge>;
    case "high":   return <Badge className="bg-orange-500">High</Badge>;
    case "medium": return <Badge variant="secondary">Medium</Badge>;
    case "low":    return <Badge variant="outline">Low</Badge>;
    default:       return null;
  }
};

const emptyForm = {
  name: "",
  clientId: "",
  stage: "draft",
  priority: "medium" as Project["priority"],
  dueDate: "",
  assignee: "",
  amount: "",
  description: "",
};

const mapApiProjectToUi = (p: any): Project => {
  const populatedClient = typeof p.clientId === "object" && p.clientId !== null ? p.clientId : null;
  const status = String(p.stage || p.status || "draft");

  return {
    id: String(p._id || p.id),
    name: String(p.name || "Untitled Project"),
    client: String(p.client || populatedClient?.clientName || "Unknown Client"),
    clientId: String(populatedClient?._id || p.clientId || ""),
    stage: status,
    priority: (p.priority || "medium") as Project["priority"],
    dueDate: String(p.dueDate || ""),
    assignee: String(p.assignee || ""),
    amount: Number(p.amount || 0),
    description: String(p.description || ""),
    workflowType: (p.workflowType || "direct_print") as Project["workflowType"],
    createdAt: String(p.createdAt || new Date().toISOString()),
    clientUniqueId: String(
      populatedClient?.schoollogUniqueId
      || p.clientUniqueId
      || p.client_unique_id
      || ""
    ),
  };
};

interface ProjectCardProps {
  project: Project;
  clientUniqueId: string;
  onDeleteRequest: (id: string, name: string) => void;
  onEdit: (project: Project) => void;
}

const ProjectCard = ({ project, clientUniqueId, onDeleteRequest, onEdit }: ProjectCardProps) => {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "PROJECT",
    item: { id: project.id, stage: project.stage },
    collect: (monitor) => ({ isDragging: !!monitor.isDragging() }),
  }));

  return (
    <div
      ref={(node) => {
        drag(node);
      }}
      className={`bg-white rounded-lg border shadow-sm p-4 cursor-move hover:shadow-md transition-shadow overflow-hidden ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <Link to={`/projects/${project.id}`}>
            <h4 className="font-medium text-foreground hover:text-secondary transition-colors">
              {project.client}
            </h4>
          </Link>
          <p className="text-xs text-muted-foreground mt-1 truncate" title={clientUniqueId}>
            {clientUniqueId}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/projects/${project.id}`}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Link>
            </DropdownMenuItem>
            <Can permission={Permission.PROJECTS__CREATE}>
              <DropdownMenuItem onClick={() => onEdit(project)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Project
              </DropdownMenuItem>
            </Can>
            <Can permission={Permission.PROJECTS__DELETE}>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDeleteRequest(project.id, project.client)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Project
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
        {project.description}
      </p>

      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderKanban className="h-3 w-3" />
          {project.name}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          Due: {project.dueDate}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t">
        <div className="flex items-center gap-2">
          {getPriorityBadge(project.priority)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            ₹{project.amount.toLocaleString()}
          </span>
          {project.assignee && (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-xs bg-gradient-to-br from-secondary to-accent text-white">
                {project.assignee.split(" ").map((n) => n[0]).join("")}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  );
};

interface KanbanColumnProps {
  stage: typeof stages[0];
  projects: Project[];
  resolveClientUniqueId: (project: Project) => string;
  onDrop: (id: string, stage: string) => void;
  onDeleteRequest: (id: string, name: string) => void;
  onEdit: (project: Project) => void;
}

const KanbanColumn = ({ stage, projects, resolveClientUniqueId, onDrop, onDeleteRequest, onEdit }: KanbanColumnProps) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: "PROJECT",
    drop: (item: { id: string; stage: string }) => {
      if (item.stage !== stage.id) {
        onDrop(item.id, stage.id);
      }
    },
    collect: (monitor) => ({ isOver: !!monitor.isOver() }),
  }));

  const stageProjects = projects.filter((p) => p.stage === stage.id);

  return (
    <div
      ref={(node) => {
        drop(node);
      }}
      className={`flex-shrink-0 w-[300px] rounded-lg border-2 ${stage.color} ${
        isOver ? "ring-2 ring-secondary" : ""
      }`}
    >
      <div className="p-4 border-b bg-white/50">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-foreground">{stage.name}</h3>
          <Badge variant="secondary" className="text-xs">
            {stageProjects.length}
          </Badge>
        </div>
      </div>
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="p-4 space-y-3 w-full">
          {stageProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              clientUniqueId={resolveClientUniqueId(project)}
              onDeleteRequest={onDeleteRequest}
              onEdit={onEdit}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

export function Projects() {
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [clients, setClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Partial<typeof emptyForm>>({});
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editErrors, setEditErrors] = useState<Partial<typeof emptyForm>>({});
  const [version, setVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadClients()
      .then((data) => {
        if (mounted) {
          setClients(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (mounted) {
          setClients([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetchProjects()
      .then((data) => {
        if (!mounted) return;
        if (!Array.isArray(data)) {
          setAllProjects([]);
          return;
        }
        setAllProjects(data.map(mapApiProjectToUi));
      })
      .catch(() => {
        if (mounted) {
          setAllProjects([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [version]);

  void version;
  const today = new Date();

  const filtered = allProjects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStage = stageFilter === "all" || p.stage === stageFilter;
    const matchesPriority = priorityFilter === "all" || p.priority === priorityFilter;

    const isOverdue = Boolean(
      p.dueDate
      && p.stage !== "delivered"
      && new Date(p.dueDate) < today
    );
    const matchesOverdue = !overdueOnly || isOverdue;

    return matchesSearch && matchesStage && matchesPriority && matchesOverdue;
  });

  const activeFilterCount =
    (stageFilter !== "all" ? 1 : 0)
    + (priorityFilter !== "all" ? 1 : 0)
    + (overdueOnly ? 1 : 0);

  const resolveClientUniqueId = (project: Project): string => {
    const fromProject = String((project as any).clientUniqueId || "").trim();
    if (fromProject) return fromProject;

    const matchedClient = clients.find((c) => String(c.id) === String(project.clientId));
    const fromClient = String(matchedClient?.schoollogUniqueId || "").trim();
    return fromClient || "N/A";
  };

  const inProgress = allProjects.filter(
    (p) => !["delivered", "draft"].includes(p.stage)
  ).length;
  const completed = allProjects.filter((p) => p.stage === "delivered").length;
  const thisWeek = allProjects.filter((p) => {
    const created = new Date(p.createdAt);
    return (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24) <= 7;
  }).length;
  const overdue = allProjects.filter((p) => {
    if (!p.dueDate || p.stage === "delivered") return false;
    const due = new Date(p.dueDate);
    return due < today;
  }).length;

  const setField = (field: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Partial<typeof emptyForm> = {};
    if (!form.name.trim()) e.name = "Project name is required";
    if (!form.clientId) e.clientId = "Select a client";
    if (!form.dueDate) e.dueDate = "Due date is required";
    if (!form.amount || Number(form.amount) < 0) e.amount = "Enter a valid amount";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    const client = clients.find((c) => c.id === form.clientId);
    const payload = {
      name: form.name,
      clientId: form.clientId,
      client: client?.clientName ?? form.clientId,
      stage: form.stage,
      priority: form.priority,
      dueDate: form.dueDate,
      assignee: form.assignee,
      amount: Number(form.amount),
      description: form.description,
      workflowType: "direct_print" as const,
    };

    const created = await apiCreateProject(payload);
    if (created) {
      setVersion((v) => v + 1);
    }

    setForm(emptyForm);
    setErrors({});
    setIsDialogOpen(false);
  };

  const handleEditOpen = (project: Project) => {
    setEditingProject(project);
    setEditForm({
      name: project.name,
      clientId: project.clientId,
      stage: project.stage,
      priority: project.priority,
      dueDate: project.dueDate,
      assignee: project.assignee,
      amount: String(project.amount),
      description: project.description,
    });
    setEditErrors({});
    setIsEditDialogOpen(true);
  };

  const validateEdit = () => {
    const e: Partial<typeof editForm> = {};
    if (!editForm.name.trim()) e.name = "Project name is required";
    if (!editForm.clientId) e.clientId = "Select a client";
    if (!editForm.dueDate) e.dueDate = "Due date is required";
    if (!editForm.amount || Number(editForm.amount) < 0) e.amount = "Enter a valid amount";
    setEditErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleEditSubmit = async () => {
    if (!validateEdit() || !editingProject) return;
    const client = clients.find((c) => c.id === editForm.clientId);
    const updated = await apiUpdateProject(editingProject.id, {
      name: editForm.name,
      clientId: editForm.clientId,
      client: client?.clientName ?? editForm.clientId,
      stage: editForm.stage,
      priority: editForm.priority,
      dueDate: editForm.dueDate,
      assignee: editForm.assignee,
      amount: Number(editForm.amount),
      description: editForm.description,
      workflowType: "direct_print" as const,
    });

    if (updated) {
      setVersion((v) => v + 1);
    }

    setEditingProject(null);
    setEditForm(emptyForm);
    setEditErrors({});
    setIsEditDialogOpen(false);
  };

  const setEditField = (field: keyof typeof emptyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setEditForm((f) => ({ ...f, [field]: e.target.value }));

  const handleDrop = async (id: string, stage: string) => {
    const updated = await apiUpdateProject(id, { stage });
    if (updated) {
      setVersion((v) => v + 1);
    }
  };

  const handleDeleteRequest = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const ok = await apiDeleteProject(deleteTarget.id);
      if (ok) {
        setAllProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        toast.success(`"${deleteTarget.name}" deleted successfully`);
      } else {
        toast.error("Failed to delete project. Please try again.");
      }
    } catch {
      toast.error("An unexpected error occurred while deleting.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage project workflow from draft to delivery
          </p>
        </div>
        <Can permission={Permission.PROJECTS__CREATE}>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) { setForm(emptyForm); setErrors({}); } }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {/* Name */}
                <div className="space-y-2">
                  <Label>Project Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Project name" value={form.name} onChange={setField("name")} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                {/* Client */}
                <div className="space-y-2">
                  <Label>Client <span className="text-destructive">*</span></Label>
                  <Select value={form.clientId} onValueChange={(v) => setForm((f) => ({ ...f, clientId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                    <SelectContent className="max-h-60">
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.clientName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.clientId && <p className="text-xs text-destructive">{errors.clientId}</p>}
                </div>
                {/* Stage & Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Stage</Label>
                    <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {stages.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v as Project["priority"] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Due Date & Amount */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Due Date <span className="text-destructive">*</span></Label>
                    <Input type="date" value={form.dueDate} onChange={setField("dueDate")} />
                    {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (₹) <span className="text-destructive">*</span></Label>
                    <Input type="number" placeholder="0" min={0} value={form.amount} onChange={setField("amount")} />
                    {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
                  </div>
                </div>
                {/* Assignee */}
                <div className="space-y-2">
                  <Label>Assignee</Label>
                  <Input placeholder="Assignee name" value={form.assignee} onChange={setField("assignee")} />
                </div>
                {/* Description */}
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea placeholder="Project description" rows={3} value={form.description} onChange={setField("description")} />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setIsDialogOpen(false); setForm(emptyForm); setErrors({}); }}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit}>Create Project</Button>
              </div>
            </DialogContent>
          </Dialog>
        </Can>
        
        {/* Edit Project Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { setEditingProject(null); setEditForm(emptyForm); setEditErrors({}); } }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {/* Name */}
              <div className="space-y-2">
                <Label>Project Name <span className="text-destructive">*</span></Label>
                <Input placeholder="Project name" value={editForm.name} onChange={setEditField("name")} />
                {editErrors.name && <p className="text-xs text-destructive">{editErrors.name}</p>}
              </div>
              {/* Client */}
              <div className="space-y-2">
                <Label>Client <span className="text-destructive">*</span></Label>
                <Select value={editForm.clientId} onValueChange={(v) => setEditForm((f) => ({ ...f, clientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.clientName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editErrors.clientId && <p className="text-xs text-destructive">{editErrors.clientId}</p>}
              </div>
              {/* Stage & Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Stage</Label>
                  <Select value={editForm.stage} onValueChange={(v) => setEditForm((f) => ({ ...f, stage: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={editForm.priority} onValueChange={(v) => setEditForm((f) => ({ ...f, priority: v as Project["priority"] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* Due Date & Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Due Date <span className="text-destructive">*</span></Label>
                  <Input type="date" value={editForm.dueDate} onChange={setEditField("dueDate")} />
                  {editErrors.dueDate && <p className="text-xs text-destructive">{editErrors.dueDate}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Amount (₹) <span className="text-destructive">*</span></Label>
                  <Input type="number" placeholder="0" min={0} value={editForm.amount} onChange={setEditField("amount")} />
                  {editErrors.amount && <p className="text-xs text-destructive">{editErrors.amount}</p>}
                </div>
              </div>
              {/* Assignee */}
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Input placeholder="Assignee name" value={editForm.assignee} onChange={setEditField("assignee")} />
              </div>
              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Project description" rows={3} value={editForm.description} onChange={setEditField("description")} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setEditingProject(null); setEditForm(emptyForm); setEditErrors({}); }}>
                Cancel
              </Button>
              <Button onClick={handleEditSubmit}>Save Changes</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search projects by name, client, or ID..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <Filter className="h-4 w-4" />
                    Filter
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px]">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>Stage</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={stageFilter} onValueChange={setStageFilter}>
                    <DropdownMenuRadioItem value="all">All Stages</DropdownMenuRadioItem>
                    {stages.map((stage) => (
                      <DropdownMenuRadioItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuLabel>Priority</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={priorityFilter} onValueChange={setPriorityFilter}>
                    <DropdownMenuRadioItem value="all">All Priorities</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="low">Low</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="medium">Medium</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="high">High</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="urgent">Urgent</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>

                  <DropdownMenuSeparator />

                  <DropdownMenuCheckboxItem
                    checked={overdueOnly}
                    onCheckedChange={(checked) => setOverdueOnly(checked === true)}
                  >
                    Overdue Only
                  </DropdownMenuCheckboxItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    onClick={() => {
                      setStageFilter("all");
                      setPriorityFilter("all");
                      setOverdueOnly(false);
                    }}
                  >
                    Clear Filters
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex border rounded-lg">
                <Button
                  variant={viewMode === "kanban" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("kanban")}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-warning" />
              <div>
                <p className="text-2xl font-bold">{inProgress}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{overdue}</p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
              <div>
                <p className="text-2xl font-bold">{completed}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Plus className="h-5 w-5 text-secondary" />
              <div>
                <p className="text-2xl font-bold">{thisWeek}</p>
                <p className="text-sm text-muted-foreground">This Week</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      {viewMode === "kanban" && (
        <DndProvider backend={HTML5Backend}>
          <Card className="shadow-md">
            <CardContent className="p-4">
              <ScrollArea className="w-full">
                <div className="flex gap-4 pb-4 min-w-max">
                  {stages.map((stage) => (
                    <KanbanColumn
                      key={stage.id}
                      stage={stage}
                      projects={filtered}
                      resolveClientUniqueId={resolveClientUniqueId}
                      onDrop={handleDrop}
                      onDeleteRequest={handleDeleteRequest}
                      onEdit={handleEditOpen}
                    />
                  ))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </CardContent>
          </Card>
        </DndProvider>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>All Projects</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No projects found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((project) => (
                  <div key={project.id} className="flex items-center justify-between py-3">
                    <div className="flex-1">
                      <Link to={`/projects/${project.id}`} className="font-medium text-foreground hover:text-secondary transition-colors">
                        {project.name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate" title={`${resolveClientUniqueId(project)} · ${project.client}`}>
                        {resolveClientUniqueId(project)} · {project.client}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {getPriorityBadge(project.priority)}
                      <Badge variant="outline">{stages.find((s) => s.id === project.stage)?.name ?? project.stage}</Badge>
                      <span className="text-sm font-medium">₹{project.amount.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span>{" "}
              and all associated templates, student data, and files.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "Deleting..." : "Delete Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

