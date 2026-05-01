import { Permission } from "./permissions";

// ─────────────────────────────────────────────────────────────
//  Role identifiers
// ─────────────────────────────────────────────────────────────
export const Role = {
  SUPER_ADMIN: "super_admin",
  MASTER_VENDOR: "master_vendor",
  SUB_VENDOR: "sub_vendor",
  SALES_PERSON: "sales_person",
  DESIGNER_STAFF: "designer_staff",
  DATA_OPERATOR: "data_operator",
  PRODUCTION_MANAGER: "production_manager",
  ACCOUNTS_MANAGER: "accounts_manager",
  CLIENT: "client",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

// ─────────────────────────────────────────────────────────────
//  Role metadata
// ─────────────────────────────────────────────────────────────
export interface RoleDefinition {
  id: Role;
  label: string;
  description: string;
  permissions: Permission[];
}

// ─────────────────────────────────────────────────────────────
//  Role → Permission mappings
// ─────────────────────────────────────────────────────────────
export const ROLE_DEFINITIONS: Record<Role, RoleDefinition> = {
  // ── 1. Super Admin ────────────────────────────────────────
  [Role.SUPER_ADMIN]: {
    id: Role.SUPER_ADMIN,
    label: "Super Admin",
    description: "Full platform access — manages entire system",
    permissions: Object.values(Permission) as Permission[],
  },

  // ── 2. Master Vendor / Franchise ──────────────────────────
  [Role.MASTER_VENDOR]: {
    id: Role.MASTER_VENDOR,
    label: "Master Vendor / Franchise",
    description: "Manages client schools, projects and sub-vendors",
    permissions: [
      Permission.CLIENTS__MANAGE,
      Permission.CLIENTS__CREATE,
      Permission.CLIENTS__VIEW,
      Permission.PROJECTS__VIEW_ALL,
      Permission.PROJECTS__CREATE,
      Permission.ORDERS__MANAGE,
      Permission.ORDERS__VIEW,
      Permission.STAFF__MANAGE,
      Permission.STAFF__ASSIGN,
      Permission.STAFF__VIEW,
      Permission.WALLET__MANAGE,
      Permission.WALLET__VIEW,
      Permission.WALLET__RECORD_PAYMENT,
      Permission.WALLET__UPLOAD_RECEIPTS,
      Permission.COMMISSION__TRACK,
      Permission.COMMISSION__VIEW,
      Permission.REPORTS__VENDOR,
      Permission.REPORTS__SALES,
      Permission.REPORTS__FINANCIAL,
      Permission.REPORTS__WALLET,
      Permission.PRODUCTS__VIEW,
      Permission.LEADS__MANAGE,
      Permission.QUOTES__GENERATE,
      Permission.PRODUCTION__VIEW_APPROVED,
      Permission.DESIGN__ACCESS_STUDIO,
      Permission.DESIGN__CREATE_EDIT_TEMPLATES,
      Permission.DESIGN__GENERATE_PREVIEWS,
      Permission.DATA__UPLOAD_EXCEL,
      Permission.DATA__MAP_COLUMNS,
      Permission.DATA__VALIDATE_RECORDS,
      Permission.DATA__UPLOAD_PHOTOS,
      Permission.DATA__AUTO_MATCH_PHOTOS,
      Permission.DATA__EDIT_RECORDS,
      Permission.PROJECTS__DELETE,
    ],
  },

  // ── 3. Sub Vendor ─────────────────────────────────────────
  [Role.SUB_VENDOR]: {
    id: Role.SUB_VENDOR,
    label: "Sub Vendor",
    description: "Manages assigned clients and their projects",
    permissions: [
      Permission.CLIENTS__VIEW,
      Permission.CLIENTS__CREATE,
      Permission.PROJECTS__VIEW_ASSIGNED,
      Permission.PROJECTS__CREATE,
      Permission.ORDERS__VIEW,
      Permission.DATA__UPLOAD_EXCEL,
      Permission.DATA__UPLOAD_PHOTOS,
      Permission.WALLET__VIEW,
      Permission.DESIGN__ACCESS_DATA,
      Permission.PRODUCTION__VIEW_APPROVED,
    ],
  },

  // ── 4. Sales Person ───────────────────────────────────────
  [Role.SALES_PERSON]: {
    id: Role.SALES_PERSON,
    label: "Sales Person",
    description: "Acquires clients, manages leads and generates quotes",
    permissions: [
      Permission.CLIENTS__CREATE,
      Permission.CLIENTS__VIEW,
      Permission.LEADS__MANAGE,
      Permission.QUOTES__GENERATE,
      Permission.PROJECTS__CREATE,
      Permission.PROJECTS__VIEW_ASSIGNED,
      Permission.ORDERS__VIEW,
      Permission.COMMISSION__VIEW,
      Permission.PRODUCTS__VIEW,
    ],
  },

  // ── 5. Designer Staff ─────────────────────────────────────
  [Role.DESIGNER_STAFF]: {
    id: Role.DESIGNER_STAFF,
    label: "Designer Staff",
    description: "Creates and manages design templates and proofs",
    permissions: [
      Permission.DESIGN__ACCESS_STUDIO,
      Permission.DESIGN__CREATE_EDIT_TEMPLATES,
      Permission.DESIGN__RECEIVE_TASKS,
      Permission.DESIGN__UPLOAD_PROOFS,
      Permission.DESIGN__SEND_PROOFS,
      Permission.DESIGN__ACCESS_DATA,
      Permission.DESIGN__GENERATE_PREVIEWS,
      Permission.PROJECTS__VIEW_ASSIGNED,
    ],
  },

  // ── 6. Data Operator ──────────────────────────────────────
  [Role.DATA_OPERATOR]: {
    id: Role.DATA_OPERATOR,
    label: "Data Operator",
    description: "Handles data uploads, mapping and photo matching",
    permissions: [
      Permission.DATA__UPLOAD_EXCEL,
      Permission.DATA__MAP_COLUMNS,
      Permission.DATA__VALIDATE_RECORDS,
      Permission.DATA__UPLOAD_PHOTOS,
      Permission.DATA__AUTO_MATCH_PHOTOS,
      Permission.DATA__FIX_PHOTOS,
      Permission.DATA__EDIT_RECORDS,
      Permission.DESIGN__ACCESS_DATA,
      Permission.PROJECTS__VIEW_ASSIGNED,
    ],
  },

  // ── 7. Production Manager ─────────────────────────────────
  [Role.PRODUCTION_MANAGER]: {
    id: Role.PRODUCTION_MANAGER,
    label: "Production Manager",
    description: "Oversees print production, batches and dispatch",
    permissions: [
      Permission.PRODUCTION__VIEW_APPROVED,
      Permission.PRODUCTION__GENERATE_PDFS,
      Permission.PRODUCTION__MANAGE_BATCHES,
      Permission.PRODUCTION__DISPATCH,
      Permission.PRODUCTION__REPRINT,
      Permission.ORDERS__VIEW,
      Permission.ORDERS__MANAGE,
      Permission.REPORTS__PRODUCTION,
      Permission.PROJECTS__VIEW_ASSIGNED,
    ],
  },

  // ── 8. Accounts / Credit Manager ─────────────────────────
  [Role.ACCOUNTS_MANAGER]: {
    id: Role.ACCOUNTS_MANAGER,
    label: "Accounts / Credit Manager",
    description: "Manages wallets, payments and credit operations",
    permissions: [
      Permission.WALLET__MANAGE,
      Permission.WALLET__VIEW,
      Permission.WALLET__RECORD_PAYMENT,
      Permission.WALLET__UPLOAD_RECEIPTS,
      Permission.WALLET__SET_CREDIT_LIMIT,
      Permission.WALLET__MONITOR_OVERDUE,
      Permission.CLIENTS__VIEW,
      Permission.CLIENTS__BLOCK,
      Permission.REPORTS__FINANCIAL,
      Permission.REPORTS__WALLET,
      Permission.PROJECTS__VIEW_ALL,
    ],
  },

  // ── 9. Client (School) ────────────────────────────────────
  [Role.CLIENT]: {
    id: Role.CLIENT,
    label: "Client (School)",
    description: "School user — manages own project data and approvals",
    permissions: [
      Permission.PROJECTS__VIEW_ASSIGNED,
      Permission.CLIENT_PORTAL__UPLOAD_DATA,
      Permission.CLIENT_PORTAL__UPLOAD_PHOTOS,
      Permission.CLIENT_PORTAL__REVIEW_PROOFS,
      Permission.CLIENT_PORTAL__APPROVE_DESIGNS,
      Permission.CLIENT_PORTAL__VIEW_PRODUCTION,
      Permission.CLIENT_PORTAL__TRACK_SHIPMENT,
      Permission.CLIENT_PORTAL__VIEW_INVOICES,
      Permission.WALLET__VIEW,
    ],
  },
};

// ─────────────────────────────────────────────────────────────
//  Helper utilities
// ─────────────────────────────────────────────────────────────

/** Returns the full set of permissions for a given role. */
export function getPermissionsForRole(role: Role): Set<Permission> {
  return new Set(ROLE_DEFINITIONS[role]?.permissions ?? []);
}

/** Check whether a role has a specific permission. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return getPermissionsForRole(role).has(permission);
}

/** Check whether a role has ALL of the given permissions. */
export function roleHasAllPermissions(role: Role, permissions: Permission[]): boolean {
  const set = getPermissionsForRole(role);
  return permissions.every((p) => set.has(p));
}

/** Check whether a role has ANY of the given permissions. */
export function roleHasAnyPermission(role: Role, permissions: Permission[]): boolean {
  const set = getPermissionsForRole(role);
  return permissions.some((p) => set.has(p));
}

export const ALL_ROLES = Object.values(Role) as Role[];
