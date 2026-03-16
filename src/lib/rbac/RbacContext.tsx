import React, { createContext, useContext, useMemo, useState } from "react";
import type { Permission } from "./permissions";
import type { Role } from "./roles";
import {
  ROLE_DEFINITIONS,
  getPermissionsForRole,
  roleHasPermission,
  roleHasAllPermissions,
  roleHasAnyPermission,
} from "./roles";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────
export interface RbacUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Optional tenant scoping for multi-tenant setups */
  tenantId?: string;
  avatarInitials?: string;
}

interface RbacContextValue {
  user: RbacUser | null;
  /** Set / swap the current user (e.g. after login or role-switch) */
  setUser: (user: RbacUser | null) => void;
  /** Resolved permission set for the current user's role */
  permissions: Set<Permission>;
  /** True if the user's role includes this permission */
  can: (permission: Permission) => boolean;
  /** True if the user's role includes ALL listed permissions */
  canAll: (permissions: Permission[]) => boolean;
  /** True if the user's role includes ANY of the listed permissions */
  canAny: (permissions: Permission[]) => boolean;
  /** True if the current user has at least one of the given roles */
  hasRole: (roles: Role | Role[]) => boolean;
  /** Human-readable label for the current role */
  roleLabel: string;
}

// ─────────────────────────────────────────────────────────────
//  Context
// ─────────────────────────────────────────────────────────────
const RbacContext = createContext<RbacContextValue | null>(null);

// ─────────────────────────────────────────────────────────────
//  Provider
// ─────────────────────────────────────────────────────────────
interface RbacProviderProps {
  children: React.ReactNode;
  /** Initial user — pass null for unauthenticated state */
  initialUser?: RbacUser | null;
}

export function RbacProvider({ children, initialUser = null }: RbacProviderProps) {
  const [user, setUser] = useState<RbacUser | null>(initialUser);

  const value = useMemo<RbacContextValue>(() => {
    const permissions = user ? getPermissionsForRole(user.role) : new Set<Permission>();
    const roleDef = user ? ROLE_DEFINITIONS[user.role] : null;

    return {
      user,
      setUser,
      permissions,
      can: (p) => (user ? roleHasPermission(user.role, p) : false),
      canAll: (ps) => (user ? roleHasAllPermissions(user.role, ps) : false),
      canAny: (ps) => (user ? roleHasAnyPermission(user.role, ps) : false),
      hasRole: (roles) => {
        if (!user) return false;
        return Array.isArray(roles) ? roles.includes(user.role) : user.role === roles;
      },
      roleLabel: roleDef?.label ?? "",
    };
  }, [user]);

  return <RbacContext.Provider value={value}>{children}</RbacContext.Provider>;
}

// ─────────────────────────────────────────────────────────────
//  Core hook
// ─────────────────────────────────────────────────────────────
export function useRbac(): RbacContextValue {
  const ctx = useContext(RbacContext);
  if (!ctx) throw new Error("useRbac must be used inside <RbacProvider>");
  return ctx;
}

// ─────────────────────────────────────────────────────────────
//  Convenience hooks
// ─────────────────────────────────────────────────────────────

/** Returns true if the current user has the given permission. */
export function usePermission(permission: Permission): boolean {
  return useRbac().can(permission);
}

/** Returns true if the current user has ALL of the given permissions. */
export function useAllPermissions(permissions: Permission[]): boolean {
  return useRbac().canAll(permissions);
}

/** Returns true if the current user has ANY of the given permissions. */
export function useAnyPermission(permissions: Permission[]): boolean {
  return useRbac().canAny(permissions);
}

/** Returns true if the current user is one of the given roles. */
export function useRole(roles: Role | Role[]): boolean {
  return useRbac().hasRole(roles);
}

/** Returns the current authenticated user. */
export function useCurrentUser(): RbacUser | null {
  return useRbac().user;
}
