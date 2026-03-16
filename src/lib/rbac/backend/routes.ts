// @ts-nocheck
// NOTE: This file is a backend reference for Node.js / Express.
//       It is NOT imported by the frontend. Copy to your server project.
/**
 * backend/routes/example.ts
 * ─────────────────────────────────────────────────────────────────
 *  Example protected API routes demonstrating RBAC middleware usage.
 *  Mount in your Express app: app.use('/api', exampleRouter)
 * ─────────────────────────────────────────────────────────────────
 */

import { Router, Request, Response } from "express";
import {
  authenticate,
  requirePermission,
  requireAnyPermission,
  requireRole,
  tenantScope,
} from "./middleware";

const router = Router();

// ── All routes below require a valid JWT ──────────────────────
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
//  Projects
// ─────────────────────────────────────────────────────────────

/** GET /api/projects — any role that can view projects */
router.get(
  "/projects",
  requireAnyPermission("projects:view_all", "projects:view_assigned"),
  (req: Request, res: Response) => {
    // Super admin / accounts manager → fetch all
    // Others → filter to their assigned projects (done in service layer)
    const fetchAll = req.user?.permissions.includes("projects:view_all");
    res.json({ scope: fetchAll ? "all" : "assigned", projects: [] });
  }
);

/** POST /api/projects — only roles that can create projects */
router.post(
  "/projects",
  requirePermission("projects:create"),
  (req: Request, res: Response) => {
    // Validate body, create project...
    res.status(201).json({ message: "Project created", tenantId: req.user?.tenantId });
  }
);

/** PATCH /api/projects/:id/stage — only super admin can force-move */
router.patch(
  "/projects/:id/stage",
  requirePermission("projects:override_stage"),
  (req: Request, res: Response) => {
    res.json({ message: "Stage overridden", projectId: req.params.id });
  }
);

// ─────────────────────────────────────────────────────────────
//  Clients
// ─────────────────────────────────────────────────────────────

router.get(
  "/clients",
  requireAnyPermission("clients:view", "clients:manage"),
  (req: Request, res: Response) => {
    res.json({ clients: [] });
  }
);

router.post(
  "/clients",
  requirePermission("clients:create"),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "Client created" });
  }
);

router.patch(
  "/clients/:id/block",
  requirePermission("clients:block"),
  (req: Request, res: Response) => {
    res.json({ message: "Client blocked", clientId: req.params.id });
  }
);

// ─────────────────────────────────────────────────────────────
//  Wallet
// ─────────────────────────────────────────────────────────────

router.post(
  "/wallet/payment",
  requirePermission("wallet:record_payment"),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "Payment recorded" });
  }
);

router.put(
  "/wallet/:clientId/credit-limit",
  requirePermission("wallet:set_credit_limit"),
  (req: Request, res: Response) => {
    res.json({ message: "Credit limit updated" });
  }
);

// ─────────────────────────────────────────────────────────────
//  Design
// ─────────────────────────────────────────────────────────────

router.post(
  "/design/proofs",
  requirePermission("design:upload_proofs"),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "Proof uploaded" });
  }
);

router.post(
  "/design/proofs/:id/send",
  requirePermission("design:send_proofs"),
  (req: Request, res: Response) => {
    res.json({ message: "Proof sent for approval" });
  }
);

// Client approves or rejects proof
router.patch(
  "/design/proofs/:id/decision",
  requirePermission("client_portal:approve_designs"),
  (req: Request, res: Response) => {
    const { decision } = req.body as { decision: "approved" | "rejected" };
    res.json({ message: `Proof ${decision}`, proofId: req.params.id });
  }
);

// ─────────────────────────────────────────────────────────────
//  Data Processing
// ─────────────────────────────────────────────────────────────

router.post(
  "/data/upload",
  requirePermission("data:upload_excel"),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "Excel uploaded" });
  }
);

// ─────────────────────────────────────────────────────────────
//  Production
// ─────────────────────────────────────────────────────────────

router.post(
  "/production/batches",
  requirePermission("production:manage_batches"),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "Batch created" });
  }
);

router.patch(
  "/production/batches/:id/dispatch",
  requirePermission("production:dispatch"),
  (req: Request, res: Response) => {
    res.json({ message: "Dispatched", batchId: req.params.id });
  }
);

// ─────────────────────────────────────────────────────────────
//  Reports — role-scoped
// ─────────────────────────────────────────────────────────────

router.get(
  "/reports/platform",
  requirePermission("reports:platform"),
  (_req, res) => res.json({ report: "platform", data: [] })
);

router.get(
  "/reports/financial",
  requireAnyPermission("reports:financial", "reports:platform"),
  (_req, res) => res.json({ report: "financial", data: [] })
);

router.get(
  "/reports/production",
  requireAnyPermission("reports:production", "reports:platform"),
  (_req, res) => res.json({ report: "production", data: [] })
);

// ─────────────────────────────────────────────────────────────
//  Admin — Super Admin only
// ─────────────────────────────────────────────────────────────

router.get(
  "/admin/roles",
  requireRole("super_admin"),
  (_req, res) => res.json({ roles: [] })
);

router.post(
  "/admin/roles",
  requirePermission("platform:manage_roles"),
  (req: Request, res: Response) => {
    res.status(201).json({ message: "Role created" });
  }
);

export default router;
