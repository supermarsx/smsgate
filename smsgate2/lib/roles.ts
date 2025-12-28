import type { Role } from "./auth";

const ROLE_ORDER: Role[] = ["viewer", "verifier", "manager", "admin"];

export function roleRank(role: Role): number {
  const idx = ROLE_ORDER.indexOf(role);
  return idx === -1 ? 0 : idx;
}

export function hasAtLeast(role: Role, minimum: Role): boolean {
  return roleRank(role) >= roleRank(minimum);
}

export function allowedNav(role: Role): Array<{ label: string; path: string; minRole: Role }> {
  return [
    { label: "Dashboard", path: "/dashboard", minRole: "viewer" },
    { label: "Devices", path: "/devices", minRole: "manager" },
    { label: "Numbers", path: "/numbers", minRole: "manager" },
    { label: "Users", path: "/users", minRole: "manager" },
    { label: "Audit", path: "/audit", minRole: "manager" },
    { label: "Logins", path: "/logins", minRole: "manager" },
    { label: "Config", path: "/config", minRole: "admin" }
  ].filter((item) => hasAtLeast(role, item.minRole));
}
