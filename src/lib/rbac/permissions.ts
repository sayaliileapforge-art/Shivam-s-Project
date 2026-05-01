/**
 * RBAC Permission Constants
 * Each permission represents a discrete action on a resource.
 * Format: RESOURCE__ACTION
 */
export const Permission = {
  // ── Vendor Management ──────────────────────────────────────────
  VENDORS__MANAGE: "vendors:manage",
  VENDORS__VIEW: "vendors:view",

  // ── Staff ──────────────────────────────────────────────────────
  STAFF__MANAGE: "staff:manage",
  STAFF__ASSIGN: "staff:assign",
  STAFF__VIEW: "staff:view",

  // ── Clients / Schools ──────────────────────────────────────────
  CLIENTS__MANAGE: "clients:manage",
  CLIENTS__CREATE: "clients:create",
  CLIENTS__VIEW: "clients:view",
  CLIENTS__BLOCK: "clients:block",

  // ── Products & Pricing ─────────────────────────────────────────
  PRODUCTS__MANAGE_CATALOG: "products:manage_catalog",
  PRODUCTS__MANAGE_PRICING: "products:manage_pricing",
  PRODUCTS__VIEW: "products:view",

  // ── Projects ───────────────────────────────────────────────────
  PROJECTS__VIEW_ALL: "projects:view_all",
  PROJECTS__VIEW_ASSIGNED: "projects:view_assigned",
  PROJECTS__CREATE: "projects:create",
  PROJECTS__DELETE: "projects:delete",
  PROJECTS__OVERRIDE_STAGE: "projects:override_stage",

  // ── Leads & Quotes ─────────────────────────────────────────────
  LEADS__MANAGE: "leads:manage",
  QUOTES__GENERATE: "quotes:generate",

  // ── Print Orders ───────────────────────────────────────────────
  ORDERS__MANAGE: "orders:manage",
  ORDERS__VIEW: "orders:view",

  // ── Design ─────────────────────────────────────────────────────
  DESIGN__ACCESS_STUDIO: "design:access_studio",
  DESIGN__CREATE_EDIT_TEMPLATES: "design:create_edit_templates",
  DESIGN__RECEIVE_TASKS: "design:receive_tasks",
  DESIGN__UPLOAD_PROOFS: "design:upload_proofs",
  DESIGN__SEND_PROOFS: "design:send_proofs",
  DESIGN__ACCESS_DATA: "design:access_data",
  DESIGN__GENERATE_PREVIEWS: "design:generate_previews",

  // ── Data Ops ───────────────────────────────────────────────────
  DATA__UPLOAD_EXCEL: "data:upload_excel",
  DATA__MAP_COLUMNS: "data:map_columns",
  DATA__VALIDATE_RECORDS: "data:validate_records",
  DATA__UPLOAD_PHOTOS: "data:upload_photos",
  DATA__AUTO_MATCH_PHOTOS: "data:auto_match_photos",
  DATA__FIX_PHOTOS: "data:fix_photos",
  DATA__EDIT_RECORDS: "data:edit_records",

  // ── Production ─────────────────────────────────────────────────
  PRODUCTION__VIEW_APPROVED: "production:view_approved",
  PRODUCTION__GENERATE_PDFS: "production:generate_pdfs",
  PRODUCTION__MANAGE_BATCHES: "production:manage_batches",
  PRODUCTION__DISPATCH: "production:dispatch",
  PRODUCTION__REPRINT: "production:reprint",

  // ── Wallet ─────────────────────────────────────────────────────
  WALLET__MANAGE: "wallet:manage",
  WALLET__VIEW: "wallet:view",
  WALLET__RECORD_PAYMENT: "wallet:record_payment",
  WALLET__UPLOAD_RECEIPTS: "wallet:upload_receipts",
  WALLET__SET_CREDIT_LIMIT: "wallet:set_credit_limit",
  WALLET__MONITOR_OVERDUE: "wallet:monitor_overdue",

  // ── Commission ─────────────────────────────────────────────────
  COMMISSION__MANAGE_RULES: "commission:manage_rules",
  COMMISSION__TRACK: "commission:track",
  COMMISSION__VIEW: "commission:view",

  // ── Reports ────────────────────────────────────────────────────
  REPORTS__PLATFORM: "reports:platform",
  REPORTS__VENDOR: "reports:vendor",
  REPORTS__PRODUCTION: "reports:production",
  REPORTS__FINANCIAL: "reports:financial",
  REPORTS__WALLET: "reports:wallet",
  REPORTS__SALES: "reports:sales",

  // ── Client Portal ──────────────────────────────────────────────
  CLIENT_PORTAL__UPLOAD_DATA: "client_portal:upload_data",
  CLIENT_PORTAL__UPLOAD_PHOTOS: "client_portal:upload_photos",
  CLIENT_PORTAL__REVIEW_PROOFS: "client_portal:review_proofs",
  CLIENT_PORTAL__APPROVE_DESIGNS: "client_portal:approve_designs",
  CLIENT_PORTAL__VIEW_PRODUCTION: "client_portal:view_production",
  CLIENT_PORTAL__TRACK_SHIPMENT: "client_portal:track_shipment",
  CLIENT_PORTAL__VIEW_INVOICES: "client_portal:view_invoices",

  // ── Platform Config ────────────────────────────────────────────
  PLATFORM__CONFIGURE: "platform:configure",
  PLATFORM__MANAGE_ROLES: "platform:manage_roles",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];
