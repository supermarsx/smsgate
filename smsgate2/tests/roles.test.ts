import { describe, expect, it, beforeEach } from "vitest";
import { allowedNav, configureRoles, getRoleLabel, hasAtLeast, roleRank } from "../lib/roles";

describe("roles utilities", () => {
  beforeEach(() => {
    configureRoles();
  });

  it("ranks roles using custom order", () => {
    configureRoles({ order: ["guest", "user", "admin"] });
    expect(roleRank("guest" as any)).toBe(0);
    expect(roleRank("admin" as any)).toBe(2);
    expect(hasAtLeast("admin" as any, "user" as any)).toBe(true);
    expect(hasAtLeast("guest" as any, "user" as any)).toBe(false);
  });

  it("filters nav by min role", () => {
    configureRoles({ order: ["viewer", "manager", "admin", "super"] });
    const viewerNav = allowedNav("viewer" as any);
    const superNav = allowedNav("super" as any);
    expect(viewerNav.map((n) => n.path)).toContain("/dashboard");
    expect(viewerNav.map((n) => n.path)).not.toContain("/config");
    expect(superNav.map((n) => n.path)).toEqual(
      expect.arrayContaining(["/devices", "/numbers", "/users", "/audit", "/logins", "/contacts", "/config"])
    );
  });

  it("applies custom labels", () => {
    configureRoles({ labels: { admin: "Super Admin" } });
    expect(getRoleLabel("admin" as any)).toBe("Super Admin");
    expect(getRoleLabel("manager" as any)).toBe("manager");
  });
});
