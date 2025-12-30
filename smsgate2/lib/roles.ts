import type { Role } from "./auth";

export const DEFAULT_ROLE_ORDER: Role[] = ["viewer", "verifier", "manager", "admin"];

let runtimeRoleOrder: Role[] = DEFAULT_ROLE_ORDER;
let runtimeRoleLabels: Record<string, string> = {};

export function configureRoles(opts?: { order?: Role[]; labels?: Record<string, string> }) {
  runtimeRoleOrder = Array.isArray(opts?.order) && opts?.order.length ? opts.order : DEFAULT_ROLE_ORDER;
  runtimeRoleLabels = opts?.labels ?? {};
}

export function roleRank(role: Role, order: Role[] = runtimeRoleOrder): number {
  const idx = order.indexOf(role);
  return idx === -1 ? 0 : idx;
}

export function hasAtLeast(role: Role, minimum: Role, order: Role[] = runtimeRoleOrder): boolean {
  return roleRank(role, order) >= roleRank(minimum, order);
}

export function allowedNav(role: Role, order: Role[] = runtimeRoleOrder): Array<{ label: string; path: string; minRole: Role }> {
  const items: Array<{ label: string; path: string; minRole: Role }> = [
    { label: "Dashboard", path: "/dashboard", minRole: order[0] ?? "viewer" },
    { label: "Devices", path: "/devices", minRole: order[2] ?? "manager" },
    { label: "Numbers", path: "/numbers", minRole: order[2] ?? "manager" },
    { label: "Users", path: "/users", minRole: order[2] ?? "manager" },
    { label: "Audit", path: "/audit", minRole: order[2] ?? "manager" },
    { label: "Logins", path: "/logins", minRole: order[2] ?? "manager" },
    { label: "Contacts", path: "/contacts", minRole: order[2] ?? "manager" },
    { label: "Config", path: "/config", minRole: order[3] ?? "admin" }
  ];
  return items.filter((item) => hasAtLeast(role, item.minRole, order));
}

export function getRoleLabel(role: Role): string {
  return runtimeRoleLabels[role] ?? role;
}
