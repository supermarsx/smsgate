import type { Role } from "./auth";

export const DEFAULT_ROLE_ORDER: Role[] = ["viewer", "verifier", "manager", "admin"];

let runtimeRoleOrder: Role[] = DEFAULT_ROLE_ORDER;
let runtimeRoleLabels: Record<string, string> = {};

export function configureRoles(opts?: { order?: Role[]; labels?: Record<string, string> }) {
  runtimeRoleOrder = Array.isArray(opts?.order) && opts?.order.length ? opts.order : DEFAULT_ROLE_ORDER;
  runtimeRoleLabels = opts?.labels ?? {};
}

export function roleRank(role: Role, order?: Role[]): number {
  const effectiveOrder = order?.length ? order : runtimeRoleOrder;
  const idx = effectiveOrder.indexOf(role);
  return idx === -1 ? 0 : idx;
}

export function hasAtLeast(role: Role, minimum: Role, order?: Role[]): boolean {
  const effectiveOrder = order?.length ? order : runtimeRoleOrder;
  return roleRank(role, effectiveOrder) >= roleRank(minimum, effectiveOrder);
}

export function allowedNav(role: Role, order?: Role[]): Array<{ label: string; path: string; minRole: Role }> {
  const effectiveOrder = order?.length ? order : runtimeRoleOrder;
  const items: Array<{ label: string; path: string; minRole: Role }> = [
    { label: "Dashboard", path: "/dashboard", minRole: effectiveOrder[0] ?? "viewer" },
    { label: "Devices", path: "/devices", minRole: effectiveOrder[2] ?? "manager" },
    { label: "Numbers", path: "/numbers", minRole: effectiveOrder[2] ?? "manager" },
    { label: "Users", path: "/users", minRole: effectiveOrder[2] ?? "manager" },
    { label: "Audit", path: "/audit", minRole: effectiveOrder[2] ?? "manager" },
    { label: "Logins", path: "/logins", minRole: effectiveOrder[2] ?? "manager" },
    { label: "Contacts", path: "/contacts", minRole: effectiveOrder[2] ?? "manager" },
    { label: "Config", path: "/config", minRole: effectiveOrder[3] ?? "admin" }
  ];
  return items.filter((item) => hasAtLeast(role, item.minRole, effectiveOrder));
}

export function getRoleLabel(role: Role, labels?: Record<string, string>): string {
  if (labels && labels[role]) return labels[role];
  return runtimeRoleLabels[role] ?? role;
}
