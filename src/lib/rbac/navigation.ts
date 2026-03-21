import {
  LayoutDashboard,
  Users,
  Package,
  FolderKanban,
  Printer,
  Factory,
  Palette,
  Database,
  MessageSquare,
  Wallet,
  UserCog,
  BarChart3,
  TrendingUp,
  LineChart,
  Settings,
  Shield,
  CheckSquare,
  IndianRupee,
  Building2,
  FileText,
  Star,
  GitBranch,
  FileUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Permission } from "./permissions";
import { Role } from "./roles";

export interface NavItem {
  name: string;
  path: string;
  icon: LucideIcon;
  /** If provided, item is only shown when user has at least one of these permissions */
  requiredPermissions?: Permission[];
  /** If provided, item is only shown to these roles */
  allowedRoles?: Role[];
}

// ─────────────────────────────────────────────────────────────
//  Master navigation catalogue — every possible nav item
// ─────────────────────────────────────────────────────────────
export const NAV_CATALOGUE: NavItem[] = [
  {
    name: "Dashboard",
    path: "/",
    icon: LayoutDashboard,
    // Visible to everyone
  },
  {
    name: "Clients",
    path: "/clients",
    icon: Users,
    requiredPermissions: [Permission.CLIENTS__VIEW, Permission.CLIENTS__MANAGE, Permission.CLIENTS__CREATE],
  },
  {
    name: "Items",
    path: "/products",
    icon: Package,
    requiredPermissions: [Permission.PRODUCTS__VIEW, Permission.PRODUCTS__MANAGE_CATALOG],
  },
  {
    name: "Projects",
    path: "/projects",
    icon: FolderKanban,
    requiredPermissions: [Permission.PROJECTS__VIEW_ALL, Permission.PROJECTS__VIEW_ASSIGNED, Permission.PROJECTS__CREATE],
  },
  {
    name: "Project Task",
    path: "/project-tasks",
    icon: CheckSquare,
    requiredPermissions: [Permission.PROJECTS__VIEW_ASSIGNED, Permission.PROJECTS__VIEW_ALL],
  },
  {
    name: "Print Orders",
    path: "/print-orders",
    icon: Printer,
    requiredPermissions: [Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE],
  },
  {
    name: "Variable Workflow",
    path: "/workflows/variable-data",
    icon: GitBranch,
    requiredPermissions: [Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE],
  },
  {
    name: "Direct Workflow",
    path: "/workflows/direct-print",
    icon: FileUp,
    requiredPermissions: [Permission.ORDERS__VIEW, Permission.ORDERS__MANAGE],
  },
  {
    name: "Production",
    path: "/production",
    icon: Factory,
    requiredPermissions: [
      Permission.PRODUCTION__VIEW_APPROVED,
      Permission.PRODUCTION__MANAGE_BATCHES,
      Permission.PRODUCTION__GENERATE_PDFS,
    ],
  },
  {
    name: "Designer Studio",
    path: "/designer-studio",
    icon: Palette,
    requiredPermissions: [Permission.DESIGN__ACCESS_STUDIO],
  },
  {
    name: "Template Gallery",
    path: "/template-gallery",
    icon: FileText,
    requiredPermissions: [Permission.DESIGN__ACCESS_STUDIO],
  },
  {
    name: "Data Processing",
    path: "/data-processing",
    icon: Database,
    requiredPermissions: [
      Permission.DATA__UPLOAD_EXCEL,
      Permission.DATA__MAP_COLUMNS,
      Permission.DATA__VALIDATE_RECORDS,
    ],
  },
  {
    name: "Complaints",
    path: "/complaints",
    icon: MessageSquare,
    requiredPermissions: [Permission.CLIENTS__VIEW, Permission.PROJECTS__VIEW_ASSIGNED, Permission.PROJECTS__VIEW_ALL],
  },
  {
    name: "Transactions",
    path: "/finance",
    icon: IndianRupee,
    requiredPermissions: [Permission.WALLET__VIEW, Permission.WALLET__MANAGE, Permission.WALLET__RECORD_PAYMENT],
  },
  {
    name: "Staff Management",
    path: "/staff",
    icon: UserCog,
    requiredPermissions: [Permission.STAFF__MANAGE, Permission.STAFF__VIEW],
  },
  {
    name: "Vendors",
    path: "/clients",
    icon: Building2,
    requiredPermissions: [Permission.VENDORS__MANAGE, Permission.VENDORS__VIEW],
  },
  {
    name: "Leads",
    path: "/clients",
    icon: Star,
    requiredPermissions: [Permission.LEADS__MANAGE],
  },
  {
    name: "Sales Report",
    path: "/reports?tab=sales",
    icon: BarChart3,
    requiredPermissions: [Permission.REPORTS__SALES, Permission.REPORTS__PLATFORM],
  },
  {
    name: "Profit Report",
    path: "/reports?tab=profit",
    icon: TrendingUp,
    requiredPermissions: [Permission.REPORTS__FINANCIAL, Permission.REPORTS__PLATFORM, Permission.REPORTS__VENDOR],
  },
  {
    name: "Expected Sales Report",
    path: "/reports?tab=expected",
    icon: LineChart,
    requiredPermissions: [Permission.REPORTS__SALES, Permission.REPORTS__VENDOR, Permission.REPORTS__PLATFORM],
  },
  {
    name: "Reports & Analytics",
    path: "/reports",
    icon: BarChart3,
    allowedRoles: [Role.SUPER_ADMIN, Role.PRODUCTION_MANAGER, Role.ACCOUNTS_MANAGER],
    requiredPermissions: [Permission.REPORTS__PLATFORM, Permission.REPORTS__PRODUCTION, Permission.REPORTS__FINANCIAL],
  },
  {
    name: "Role Management",
    path: "/roles",
    icon: Shield,
    requiredPermissions: [Permission.PLATFORM__MANAGE_ROLES],
  },
  {
    name: "System Settings",
    path: "/settings",
    icon: Settings,
    requiredPermissions: [Permission.PLATFORM__CONFIGURE],
  },
  {
    name: "My Projects",
    path: "/projects",
    icon: FolderKanban,
    allowedRoles: [Role.CLIENT],
  },
  {
    name: "Proofs",
    path: "/project-tasks",
    icon: FileText,
    allowedRoles: [Role.CLIENT],
  },
  {
    name: "My Wallet",
    path: "/finance",
    icon: Wallet,
    allowedRoles: [Role.CLIENT],
  },
];

// ─────────────────────────────────────────────────────────────
//  Curated nav sets per role (ordered as desired in the sidebar)
// ─────────────────────────────────────────────────────────────
const ROLE_NAV_PATHS: Record<Role, string[]> = {
  [Role.SUPER_ADMIN]: [
    "/",
    "/clients",
    "/products",
    "/projects",
    "/project-tasks",
    "/print-orders",
    "/workflows/variable-data",
    "/workflows/direct-print",
    "/production",
    "/designer-studio",
    "/template-gallery",
    "/complaints",
    "/finance",
    "/staff",
    "/reports",
    "/roles",
    "/settings",
  ],
  [Role.MASTER_VENDOR]: [
    "/",
    "/products",
    "/clients",
    "/projects",
    "/project-tasks",
    "/print-orders",
    "/workflows/variable-data",
    "/workflows/direct-print",
    "/designer-studio",
    "/template-gallery",
    "/staff",
    "/finance",
    "/complaints",
    "/reports?tab=sales",
    "/reports?tab=profit",
    "/reports?tab=expected",
  ],
  [Role.SUB_VENDOR]: [
    "/",
    "/clients",
    "/projects",
    "/project-tasks",
    "/print-orders",
    "/workflows/variable-data",
    "/workflows/direct-print",
    "/finance",
    "/complaints",
  ],
  [Role.SALES_PERSON]: [
    "/",
    "/clients",
    "/projects",
    "/project-tasks",
    "/print-orders",
    "/workflows/variable-data",
    "/workflows/direct-print",
    "/reports?tab=sales",
  ],
  [Role.DESIGNER_STAFF]: [
    "/",
    "/designer-studio",
    "/template-gallery",
    "/projects",
    "/project-tasks",
  ],
  [Role.DATA_OPERATOR]: [
    "/",
    "/projects",
    "/project-tasks",
  ],
  [Role.PRODUCTION_MANAGER]: [
    "/",
    "/projects",
    "/project-tasks",
    "/print-orders",
    "/workflows/variable-data",
    "/workflows/direct-print",
    "/production",
    "/reports",
  ],
  [Role.ACCOUNTS_MANAGER]: [
    "/",
    "/clients",
    "/finance",
    "/projects",
    "/reports",
  ],
  [Role.CLIENT]: [
    "/",
    "/projects",
    "/project-tasks",
    "/finance",
    "/complaints",
  ],
};

/**
 * Returns the ordered nav items for a given role.
 * Falls back to path-based matching when a query-string variant is used.
 */
export function getNavForRole(role: Role): NavItem[] {
  const paths = ROLE_NAV_PATHS[role] ?? [];
  return paths
    .map((path) => NAV_CATALOGUE.find((item) => item.path === path))
    .filter((item): item is NavItem => item !== undefined);
}
