import { Navigate } from "react-router";
import type { Permission } from "./permissions";
import type { Role } from "./roles";
import { useRbac } from "./RbacContext";

// ─────────────────────────────────────────────────────────────
//  PermissionGuard
//  Renders children only when the current user satisfies the
//  given permission / role requirements.
// ─────────────────────────────────────────────────────────────
interface PermissionGuardProps {
  children: React.ReactNode;
  /** User must have at least one of these permissions */
  anyOf?: Permission[];
  /** User must have ALL of these permissions */
  allOf?: Permission[];
  /** User must have at least one of these roles */
  roles?: Role[];
  /**
   * What to render when access is denied.
   * - "null"      → render nothing (default)
   * - "redirect"  → redirect to /unauthorized
   * - ReactNode   → render that node
   */
  fallback?: "null" | "redirect" | React.ReactNode;
}

export function PermissionGuard({
  children,
  anyOf,
  allOf,
  roles,
  fallback = "null",
}: PermissionGuardProps) {
  const { can, canAll, canAny, hasRole, user } = useRbac();

  if (!user) {
    return fallback === "redirect"
      ? <Navigate to="/unauthorized" replace />
      : fallback === "null"
      ? null
      : <>{fallback}</>;
  }

  const roleOk = !roles || hasRole(roles);
  const anyOk = !anyOf || canAny(anyOf);
  const allOk = !allOf || canAll(allOf);

  if (roleOk && anyOk && allOk) return <>{children}</>;

  if (fallback === "redirect") return <Navigate to="/unauthorized" replace />;
  if (fallback === "null") return null;
  return <>{fallback}</>;
}

// ─────────────────────────────────────────────────────────────
//  RouteGuard — wraps a whole page/route
//  Use as the `Component` wrapper in route config or directly
//  at the top of a page component.
// ─────────────────────────────────────────────────────────────
interface RouteGuardProps {
  children: React.ReactNode;
  anyOf?: Permission[];
  allOf?: Permission[];
  roles?: Role[];
  redirectTo?: string;
}

export function RouteGuard({
  children,
  anyOf,
  allOf,
  roles,
  redirectTo = "/unauthorized",
}: RouteGuardProps) {
  return (
    <PermissionGuard anyOf={anyOf} allOf={allOf} roles={roles} fallback="redirect">
      {children}
    </PermissionGuard>
  );
}

// ─────────────────────────────────────────────────────────────
//  Convenience wrappers
// ─────────────────────────────────────────────────────────────

/** Show children only when the user has the given permission */
export function Can({
  permission,
  children,
  fallback,
}: {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { can } = useRbac();
  return can(permission) ? <>{children}</> : <>{fallback ?? null}</>;
}

/** Show children only when the user has at least one of the given roles */
export function HasRole({
  roles,
  children,
  fallback,
}: {
  roles: Role | Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { hasRole } = useRbac();
  return hasRole(roles) ? <>{children}</> : <>{fallback ?? null}</>;
}
