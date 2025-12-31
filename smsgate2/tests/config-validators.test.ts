import { describe, expect, it } from "vitest";
import { validateConfigShape } from "../lib/config-validators";

const base = {
  authModes: { oauth: true, simpleSignin: false, domainSignin: true },
  presence: {
    snapshotSize: 50,
    pingMs: 5000,
    pageSize: 25,
    maxConnections: 10,
    maxStaleMs: 300000,
    degradedMs: 90000,
    queueWarn: 10,
    queueCrit: 50
  },
  retention: { redis: 3600 },
  roles: { order: ["admin", "user"], labels: { admin: "Admin" } },
  relay: {},
  contacts: {}
};

describe("validateConfigShape", () => {
  it("returns empty when shape is valid", () => {
    expect(validateConfigShape(base)).toEqual([]);
  });

  it("rejects non-object root", () => {
    expect(validateConfigShape(null as any)).toContain("Config must be a JSON object");
    expect(validateConfigShape(123 as any)).toContain("Config must be a JSON object");
  });

  it("flags missing authModes and presence", () => {
    const issues = validateConfigShape({ retention: {} });
    expect(issues).toContain("authModes missing or not an object");
    expect(issues).toContain("presence missing or not an object");
  });

  it("validates booleans inside authModes", () => {
    const issues = validateConfigShape({
      ...base,
      authModes: { oauth: "yes", simpleSignin: 1, domainSignin: null } as any
    });
    expect(issues).toEqual(["oauth must be boolean", "simpleSignin must be boolean", "domainSignin must be boolean"]);
  });

  it("validates numeric thresholds with minimums", () => {
    const presence = {
      snapshotSize: 0,
      pingMs: "1000",
      pageSize: -1,
      maxConnections: NaN,
      maxStaleMs: 999,
      degradedMs: 800,
      queueWarn: -5,
      queueCrit: -1
    } as any;
    const issues = validateConfigShape({ ...base, presence });
    expect(issues).toEqual([
      "snapshotSize must be >= 1",
      "pingMs must be a number",
      "pageSize must be >= 1",
      "maxConnections must be a number",
      "maxStaleMs must be >= 1000",
      "degradedMs must be >= 1000",
      "queueWarn must be >= 0",
      "queueCrit must be >= 0"
    ]);
  });

  it("requires retention object", () => {
    expect(validateConfigShape({ ...base, retention: "ttl" as any })).toContain("retention missing or not an object");
  });

  it("validates roles order as non-empty strings array and labels object", () => {
    const issues = validateConfigShape({
      ...base,
      roles: { order: ["admin", "", 3], labels: "oops" as any }
    });
    expect(issues).toEqual([
      "roles.order must contain non-empty strings",
      "roles.labels must be an object when provided"
    ]);
  });

  it("flags relay/smsrelay3/contacts when not objects", () => {
    const issues = validateConfigShape({
      ...base,
      relay: [] as any,
      smsrelay3: "bad" as any,
      contacts: 1 as any
    });
    expect(issues).toEqual([
      "relay must be an object when provided",
      "smsrelay3 must be an object when provided",
      "contacts must be an object when provided"
    ]);
  });
});
