import { describe, expect, it, vi, afterEach } from "vitest";

import { sessionExpiresSoon, wsAuthHeaders, buildOAuthAuthorizeUrl } from "../lib/auth";
import type { Session } from "../lib/auth";

const baseSession: Session = {
  accessToken: "token",
  expiresAt: Date.now() + 120_000,
  user: {
    id: "u1",
    name: "Tester",
    role: "admin",
    authMode: "oauth"
  }
};

describe("auth helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("detects soon-to-expire sessions", () => {
    expect(sessionExpiresSoon(baseSession, 10_000)).toBe(false);
    const expiring: Session = { ...baseSession, expiresAt: Date.now() + 1000 };
    expect(sessionExpiresSoon(expiring, 10_000)).toBe(true);
  });

  it("builds WS headers with auth + role", () => {
    const headers = wsAuthHeaders(baseSession);
    expect(headers.Authorization).toBe("Bearer token");
    expect(headers["X-Role"]).toBe("admin");
  });

  it("builds PKCE authorize URL with stored verifier", async () => {
    const uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("uuid-test");
    const digestSpy = vi
      .spyOn(globalThis.crypto.subtle, "digest")
      .mockResolvedValue(new TextEncoder().encode("challenge").buffer);
    const url = await buildOAuthAuthorizeUrl("https://app/login/callback", "client-id");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("redirect_uri=https%3A%2F%2Fapp%2Flogin%2Fcallback");
    const stored = window.localStorage.getItem("smsgate2_pkce_verifier");
    expect(stored).toBeTruthy();
    expect(url).toContain("code_challenge=");
    expect(uuidSpy).toHaveBeenCalled();
    expect(digestSpy).toHaveBeenCalled();
  });
});
