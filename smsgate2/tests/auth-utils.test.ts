import { describe, expect, it } from "vitest";
import { sessionExpiresSoon, wsAuthHeaders, type Session } from "../lib/auth";

const baseSession: Session = {
  accessToken: "token",
  expiresAt: Date.now() + 120_000,
  user: { id: "u1", name: "User", role: "admin", authMode: "simple_signin" }
};

describe("auth utilities", () => {
  it("detects expiring sessions", () => {
    const long = { ...baseSession, expiresAt: Date.now() + 300_000 };
    expect(sessionExpiresSoon(long, 200_000)).toBe(false);
    const soon = { ...baseSession, expiresAt: Date.now() + 10_000 };
    expect(sessionExpiresSoon(soon, 20_000)).toBe(true);
  });

  it("builds ws headers with token and role", () => {
    const headers = wsAuthHeaders(baseSession);
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers["X-Role"]).toBe("admin");
    expect(headers["X-WS-Endpoint"]).toContain("ws");
  });

  it("omits headers when session missing", () => {
    expect(wsAuthHeaders(null)).toEqual({});
  });
});
