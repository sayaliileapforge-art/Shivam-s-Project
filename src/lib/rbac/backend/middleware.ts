// @ts-nocheck
// NOTE: This file is a backend reference for Node.js / Express.
//       It is NOT imported by the frontend. Copy to your server project.
/**
 * backend/middleware/rbac.ts
 * ─────────────────────────────────────────────────────────────────
 *  Express RBAC middleware for JWT-authenticated routes.
 *
 *  Stack assumptions:
 *    - Node.js + Express
 *    - JWT access tokens (jsonwebtoken)
 *    - PostgreSQL via pg (or any ORM — swap db.query() calls)
 *  ─────────────────────────────────────────────────────────────────
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "change_me_in_production";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export interface TokenPayload {
  sub: string;          // user UUID
  tenantId: string;
  role: string;         // e.g. 'master_vendor'
  permissions: string[]; // flattened array of permission strings
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  1. authenticate — verify JWT and attach user to request
// ─────────────────────────────────────────────────────────────
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token invalid or expired" });
  }
}

// ─────────────────────────────────────────────────────────────
//  2. requirePermission — allow only if user has the permission
// ─────────────────────────────────────────────────────────────
export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPerms = new Set(req.user?.permissions ?? []);
    const granted = permissions.every((p) => userPerms.has(p));
    if (!granted) {
      return res.status(403).json({
        error: "Forbidden — insufficient permissions",
        required: permissions,
      });
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────
//  3. requireAnyPermission — allow if user has at least one
// ─────────────────────────────────────────────────────────────
export function requireAnyPermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const userPerms = new Set(req.user?.permissions ?? []);
    if (permissions.some((p) => userPerms.has(p))) return next();
    return res.status(403).json({
      error: "Forbidden — insufficient permissions",
      required: `any of: ${permissions.join(", ")}`,
    });
  };
}

// ─────────────────────────────────────────────────────────────
//  4. requireRole — allow only listed roles
// ─────────────────────────────────────────────────────────────
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Forbidden — role not allowed",
        required: roles,
      });
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────
//  5. tenantScope — ensure resource belongs to requesting tenant
// ─────────────────────────────────────────────────────────────
export function tenantScope(
  getTenantId: (req: Request) => string | undefined
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const resourceTenant = getTenantId(req);
    if (resourceTenant && req.user?.tenantId !== resourceTenant) {
      return res.status(403).json({ error: "Cross-tenant access denied" });
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────
//  Token factory helper (use inside login/refresh endpoints)
// ─────────────────────────────────────────────────────────────
export function signAccessToken(payload: Omit<TokenPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "7d" });
}
