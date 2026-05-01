import { WorkflowType } from "./workflowConstants";
import { WorkflowData, StatusHistory } from "./workflowUtils";

const STORAGE_KEY = "vendor_projects";
const WORKFLOW_STORAGE_KEY = "workflow_projects";

export interface Project {
  id: string;
  name: string;
  client: string;
  clientId: string;
  clientUniqueId?: string;
  stage: string;
  priority: "urgent" | "high" | "medium" | "low";
  dueDate: string;
  assignee: string;
  amount: number;
  description: string;
  workflowType?: "variable_data" | "direct_print";
  createdAt: string;
}

export interface WorkflowProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  ownerId: string;
  ownerName: string;
  workflowType: WorkflowType;
  workflowData: WorkflowData;
  product?: {
    id: string;
    name: string;
    selectedVariableFields?: string[];
    template?: {
      id: string;
      name: string;
    };
  };
  fileData?: {
    fileName: string;
    uploadedAt: Date;
    fileSize: number;
    fileType: string;
  };
  payment?: {
    totalAmount: number;
    advanceAmount: number;
    advancePaymentDate?: Date;
    remainingAmount: number;
    remainingPaymentDate?: Date;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function addProject(data: Omit<Project, "id" | "createdAt">): Project {
  const projects = loadProjects();
  const newProject: Project = {
    ...data,
    id: `PRJ-${Date.now()}`,
    createdAt: new Date().toLocaleDateString("en-IN"),
  };
  saveProjects([...projects, newProject]);
  return newProject;
}

export function updateProjectStage(id: string, stage: string): void {
  const projects = loadProjects().map((p) =>
    p.id === id ? { ...p, stage } : p
  );
  saveProjects(projects);
}

export function updateProject(id: string, data: Partial<Omit<Project, "id" | "createdAt">>): void {
  const projects = loadProjects().map((p) =>
    p.id === id ? { ...p, ...data } : p
  );
  saveProjects(projects);
}

export function deleteProject(id: string): void {
  saveProjects(loadProjects().filter((p) => p.id !== id));
}

// ─── Project Products ────────────────────────────────────────────────────────

export interface ProjectProduct {
  id: string;
  projectId: string;
  productName: string;   // e.g. "ID CARD"
  spec: string;          // e.g. "PVC Card Single Side (86*54mm)"
  quantity: number;
  unitPrice: number;
}

const PROD_KEY = "vendor_project_products";

export function loadProjectProducts(projectId: string): ProjectProduct[] {
  try {
    const raw = localStorage.getItem(PROD_KEY);
    const all: ProjectProduct[] = raw ? JSON.parse(raw) : [];
    return all.filter((p) => p.projectId === projectId);
  } catch { return []; }
}

export function addProjectProduct(data: Omit<ProjectProduct, "id">): ProjectProduct {
  const raw = localStorage.getItem(PROD_KEY);
  const all: ProjectProduct[] = raw ? JSON.parse(raw) : [];
  const item: ProjectProduct = { ...data, id: `PP-${Date.now()}` };
  localStorage.setItem(PROD_KEY, JSON.stringify([...all, item]));
  return item;
}

export function deleteProjectProduct(id: string): void {
  const raw = localStorage.getItem(PROD_KEY);
  const all: ProjectProduct[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(PROD_KEY, JSON.stringify(all.filter((p) => p.id !== id)));
}

// ─── Project Tasks ───────────────────────────────────────────────────────────

export interface ProjectTask {
  id: string;
  projectId: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: "pending" | "in-progress" | "done";
  createdAt: string;
}

const TASK_KEY = "vendor_project_tasks";

export function loadProjectTasks(projectId: string): ProjectTask[] {
  try {
    const raw = localStorage.getItem(TASK_KEY);
    const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
    return all.filter((t) => t.projectId === projectId);
  } catch { return []; }
}

export function addProjectTask(data: Omit<ProjectTask, "id" | "createdAt">): ProjectTask {
  const raw = localStorage.getItem(TASK_KEY);
  const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
  const item: ProjectTask = { ...data, id: `TSK-${Date.now()}`, createdAt: new Date().toLocaleDateString("en-IN") };
  localStorage.setItem(TASK_KEY, JSON.stringify([...all, item]));
  return item;
}

export function updateProjectTask(id: string, data: Partial<ProjectTask>): void {
  const raw = localStorage.getItem(TASK_KEY);
  const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(TASK_KEY, JSON.stringify(all.map((t) => t.id === id ? { ...t, ...data } : t)));
}

export function deleteProjectTask(id: string): void {
  const raw = localStorage.getItem(TASK_KEY);
  const all: ProjectTask[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(TASK_KEY, JSON.stringify(all.filter((t) => t.id !== id)));
}

// ─── Project Files ───────────────────────────────────────────────────────────

export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  size: string;
  fileType: string;
  category: "template" | "print" | "data" | "other";
  uploadedAt: string;
}

const FILE_KEY = "vendor_project_files";

export function loadProjectFiles(projectId: string): ProjectFile[] {
  try {
    const raw = localStorage.getItem(FILE_KEY);
    const all: ProjectFile[] = raw ? JSON.parse(raw) : [];
    return all.filter((f) => f.projectId === projectId);
  } catch { return []; }
}

export function addProjectFile(data: Omit<ProjectFile, "id" | "uploadedAt">): ProjectFile {
  const raw = localStorage.getItem(FILE_KEY);
  const all: ProjectFile[] = raw ? JSON.parse(raw) : [];
  const item: ProjectFile = { ...data, id: `FILE-${Date.now()}`, uploadedAt: new Date().toLocaleDateString("en-IN") };
  localStorage.setItem(FILE_KEY, JSON.stringify([...all, item]));
  return item;
}

export function deleteProjectFile(id: string): void {
  const raw = localStorage.getItem(FILE_KEY);
  const all: ProjectFile[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(FILE_KEY, JSON.stringify(all.filter((f) => f.id !== id)));
}

// ─── Project Templates ───────────────────────────────────────────────────────

export interface ProjectTemplate {
  id: string;
  /** MongoDB _id if persisted remotely */
  remoteId?: string;
  projectId: string;
  /** Client that owns this template — used to show all same-client templates across projects */
  clientId?: string;
  templateName: string;
  templateType: "id_card" | "certificate" | "poster" | "custom";
  canvas: { width: number; height: number };
  margin: { top: number; left: number; right: number; bottom: number };
  applicableFor: string;
  createdAt: string;
  /** Serialised Fabric.js canvas JSON (fabric.Canvas.toObject) */
  canvasJSON?: string;
  /** Base64 PNG thumbnail for preview */
  thumbnail?: string;
  /** Whether the template is visible to all clients */
  isPublic?: boolean;
}

const TMPL_KEY = "vendor_project_templates";

export function loadAllProjectTemplates(): ProjectTemplate[] {
  try {
    const raw = localStorage.getItem(TMPL_KEY);
    return raw ? (JSON.parse(raw) as ProjectTemplate[]) : [];
  } catch {
    return [];
  }
}

/**
 * Load templates visible in a project:
 *   1. Same-client templates (any project belonging to the same client)
 *   2. The project's own templates (in case clientId is missing on legacy records)
 *   3. Globally public templates from any other client
 * Results are deduped and ordered: own-client first, then public.
 */
export function loadProjectTemplates(projectId: string, clientId?: string): ProjectTemplate[] {
  // Resolve clientId from local project store when not provided
  const resolvedClientId = clientId
    || loadProjects().find((p) => p.id === projectId)?.clientId
    || "";

  const all = loadAllProjectTemplates();
  const seen = new Set<string>();
  const result: ProjectTemplate[] = [];

  // Pass 1: same-client templates (own project first, then sibling projects)
  for (const t of all) {
    if (t.projectId === projectId) {
      seen.add(t.id);
      result.push(t);
    }
  }
  if (resolvedClientId) {
    for (const t of all) {
      if (!seen.has(t.id) && t.clientId === resolvedClientId) {
        seen.add(t.id);
        result.push(t);
      }
    }
  }

  // Pass 2: public templates from other clients
  for (const t of all) {
    if (!seen.has(t.id) && t.isPublic === true) {
      result.push(t);
    }
  }

  return result;
}

export function addProjectTemplate(data: Omit<ProjectTemplate, "id" | "createdAt">): ProjectTemplate {
  const raw = localStorage.getItem(TMPL_KEY);
  const all: ProjectTemplate[] = raw ? JSON.parse(raw) : [];
  const item: ProjectTemplate = {
    ...data,
    isPublic: data.isPublic ?? false,
    id: `TMPL-${Date.now()}`,
    createdAt: new Date().toLocaleDateString("en-IN"),
  };
  localStorage.setItem(TMPL_KEY, JSON.stringify([...all, item]));
  return item;
}

export function updateProjectTemplate(id: string, data: Partial<Omit<ProjectTemplate, "id" | "createdAt">>): void {
  const raw = localStorage.getItem(TMPL_KEY);
  const all: ProjectTemplate[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(TMPL_KEY, JSON.stringify(all.map((t) => t.id === id ? { ...t, ...data } : t)));
}

export function deleteProjectTemplate(id: string): void {
  const raw = localStorage.getItem(TMPL_KEY);
  const all: ProjectTemplate[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(TMPL_KEY, JSON.stringify(all.filter((t) => t.id !== id)));
}

// ─── Project Data Records ────────────────────────────────────────────────────

export type DataCategory = "staff" | "student";

export interface ProjectDataField {
  key: string;   // column key used in records
  label: string; // display label
}

export interface ProjectDataGroup {
  id: string;
  projectId: string;
  name: string;
  category: DataCategory;
  /** ID of the ProjectTemplate assigned to this group */
  templateId?: string;
  classFilter?: string;
  genderFilter?: string;
  transportFilter?: string;
  boardingFilter?: string;
  houseFilter?: string;
}

export interface ProjectDataRecord {
  id: string;
  projectId: string;
  category: DataCategory;
  groupId?: string;
  photo?: string; // base64 data URL
  [key: string]: unknown;
}

const DATA_FIELDS_KEY  = "vendor_project_data_fields";
const DATA_GROUPS_KEY  = "vendor_project_data_groups";
const DATA_RECORDS_KEY = "vendor_project_data_records";

// -- Fields --
export function loadDataFields(projectId: string, category: DataCategory): ProjectDataField[] {
  try {
    const raw = localStorage.getItem(DATA_FIELDS_KEY);
    const all: (ProjectDataField & { projectId: string; category: DataCategory })[] = raw ? JSON.parse(raw) : [];
    return all.filter((f) => f.projectId === projectId && f.category === category);
  } catch { return []; }
}

export function saveDataFields(projectId: string, category: DataCategory, fields: ProjectDataField[]): void {
  try {
    const raw = localStorage.getItem(DATA_FIELDS_KEY);
    const all: (ProjectDataField & { projectId: string; category: DataCategory })[] = raw ? JSON.parse(raw) : [];
    const rest = all.filter((f) => !(f.projectId === projectId && f.category === category));
    localStorage.setItem(DATA_FIELDS_KEY, JSON.stringify([
      ...rest,
      ...fields.map((f) => ({ ...f, projectId, category })),
    ]));
  } catch { /* ignore */ }
}

// -- Groups --
export function loadDataGroups(projectId: string, category: DataCategory): ProjectDataGroup[] {
  try {
    const raw = localStorage.getItem(DATA_GROUPS_KEY);
    const all: ProjectDataGroup[] = raw ? JSON.parse(raw) : [];
    return all.filter((g) => g.projectId === projectId && g.category === category);
  } catch { return []; }
}

export function addDataGroup(data: Omit<ProjectDataGroup, "id">): ProjectDataGroup {
  const raw = localStorage.getItem(DATA_GROUPS_KEY);
  const all: ProjectDataGroup[] = raw ? JSON.parse(raw) : [];
  const item = { ...data, id: `GRP-${Date.now()}` };
  localStorage.setItem(DATA_GROUPS_KEY, JSON.stringify([...all, item]));
  return item;
}

export function deleteDataGroup(id: string): void {
  const raw = localStorage.getItem(DATA_GROUPS_KEY);
  const all: ProjectDataGroup[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(DATA_GROUPS_KEY, JSON.stringify(all.filter((g) => g.id !== id)));
}

export function updateDataGroup(id: string, data: Partial<Omit<ProjectDataGroup, "id">>): void {
  const raw = localStorage.getItem(DATA_GROUPS_KEY);
  const all: ProjectDataGroup[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(DATA_GROUPS_KEY, JSON.stringify(all.map((g) => g.id === id ? { ...g, ...data } : g)));
}

// -- Records --
export function loadDataRecords(projectId: string, category: DataCategory): ProjectDataRecord[] {
  try {
    const raw = localStorage.getItem(DATA_RECORDS_KEY);
    const all: ProjectDataRecord[] = raw ? JSON.parse(raw) : [];
    return all.filter((r) => r.projectId === projectId && r.category === category);
  } catch { return []; }
}

export function saveDataRecords(projectId: string, category: DataCategory, records: ProjectDataRecord[]): void {
  try {
    const raw = localStorage.getItem(DATA_RECORDS_KEY);
    const all: ProjectDataRecord[] = raw ? JSON.parse(raw) : [];
    const rest = all.filter((r) => !(r.projectId === projectId && r.category === category));
    localStorage.setItem(DATA_RECORDS_KEY, JSON.stringify([...rest, ...records]));
  } catch { /* ignore */ }
}

export function deleteDataRecord(id: string): void {
  const raw = localStorage.getItem(DATA_RECORDS_KEY);
  const all: ProjectDataRecord[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(DATA_RECORDS_KEY, JSON.stringify(all.filter((r) => r.id !== id)));
}

export function updateDataRecord(id: string, data: Partial<ProjectDataRecord>): void {
  const raw = localStorage.getItem(DATA_RECORDS_KEY);
  const all: ProjectDataRecord[] = raw ? JSON.parse(raw) : [];
  localStorage.setItem(DATA_RECORDS_KEY, JSON.stringify(all.map((r) => r.id === id ? { ...r, ...data } : r)));
}

// ─── Workflow Projects ───────────────────────────────────────────────────────

export function loadWorkflowProjects(): WorkflowProject[] {
  try {
    const raw = localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkflowProject[]) : [];
  } catch {
    return [];
  }
}

export function saveWorkflowProjects(projects: WorkflowProject[]): void {
  localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(projects));
}

export function createWorkflowProject(
  data: Omit<
    WorkflowProject,
    "id" | "createdAt" | "updatedAt" | "workflowData"
  > & {
    workflowData?: Partial<WorkflowData>;
  }
): WorkflowProject {
  const projects = loadWorkflowProjects();
  const now = new Date();

  const workflowData: WorkflowData = {
    workflowType: data.workflowType,
    currentStatus:
      data.workflowType === WorkflowType.VARIABLE_DATA
        ? "project_created"
        : "file_received",
    statusHistory: [
      {
        previousStatus: "",
        newStatus:
          data.workflowType === WorkflowType.VARIABLE_DATA
            ? "project_created"
            : "file_received",
        timestamp: now,
        changedBy: data.ownerId,
        reason: "Project created",
      },
    ],
    createdAt: now,
    updatedAt: now,
    metadata: data.workflowData?.metadata || {},
  };

  const newProject: WorkflowProject = {
    ...data,
    id: `WFP-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    workflowData,
  };

  saveWorkflowProjects([...projects, newProject]);
  return newProject;
}

export function getWorkflowProject(id: string): WorkflowProject | null {
  const projects = loadWorkflowProjects();
  return projects.find((p) => p.id === id) || null;
}

export function updateWorkflowProject(
  id: string,
  updates: Partial<Omit<WorkflowProject, "id" | "createdAt">>
): void {
  const projects = loadWorkflowProjects();
  const updated = projects.map((p) =>
    p.id === id
      ? {
          ...p,
          ...updates,
          updatedAt: new Date(),
        }
      : p
  );
  saveWorkflowProjects(updated);
}

export function updateWorkflowStatus(
  projectId: string,
  newStatus: string,
  userId: string,
  reason?: string
): void {
  const project = getWorkflowProject(projectId);
  if (!project) return;

  const historyEntry: StatusHistory = {
    previousStatus: project.workflowData.currentStatus,
    newStatus,
    timestamp: new Date(),
    changedBy: userId,
    reason,
  };

  project.workflowData.statusHistory.push(historyEntry);
  project.workflowData.currentStatus = newStatus;
  project.workflowData.updatedAt = new Date();

  if (newStatus === "marked_delivered") {
    project.workflowData.completedAt = new Date();
  }

  updateWorkflowProject(projectId, { workflowData: project.workflowData });
}

export function getWorkflowProjectsByClient(clientId: string): WorkflowProject[] {
  const projects = loadWorkflowProjects();
  return projects.filter((p) => p.clientId === clientId);
}

export function getWorkflowProjectsByOwner(ownerId: string): WorkflowProject[] {
  const projects = loadWorkflowProjects();
  return projects.filter((p) => p.ownerId === ownerId);
}

export function deleteWorkflowProject(id: string): void {
  const projects = loadWorkflowProjects();
  saveWorkflowProjects(projects.filter((p) => p.id !== id));
}
