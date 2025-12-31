import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  saveSession,
  loadSession,
  clearSession,
  requestPasswordReset,
  loginSimple,
  loginDomain,
  refreshSession,
  logout,
  buildOAuthAuthorizeUrl,
  exchangeOAuthCode,
  sessionExpiresSoon,
  wsAuthHeaders
} from "../lib/auth";
import type { Session } from "../lib/auth";

// Mock config and smtp service dependencies
vi.mock("../lib/config", () => ({
  appConfig: { apiBaseUrl: "http://api" },
  wsUrl: () => "ws://example/ws"
}));

const enqueueJob = vi.fn();
const smtpEnabledMock = vi.fn(() => true);
vi.mock("../lib/smtp-service", () => ({
  enqueueSmtpJob: (fn: any) => enqueueJob(fn),
  smtpEnabled: () => smtpEnabledMock()
}));

type FetchResponse = { ok: boolean; status: number; json: () => any; text: () => any };
const mockFetch = vi.fn<[], Promise<FetchResponse>>();

global.fetch = mockFetch as any;

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

describe("auth storage helpers", () => {
  const session: Session = {
    accessToken: "token",
    expiresAt: Date.now() + 100_000,
    user: { id: "1", name: "Test", role: "admin", authMode: "oauth" }
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("saves and loads persistent session via localStorage", () => {
    saveSession(session, true);
    expect(loadSession()).toEqual(session);
  });

  it("saves session to sessionStorage when non-persistent", () => {
    saveSession(session, false);
    expect(sessionStorage.getItem("smsgate2_session_v1")).not.toBeNull();
  });

  it("clears sessions from both scopes", () => {
    saveSession(session, true);
    saveSession(session, false);
    clearSession();
    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem("smsgate2_session_v1")).toBeNull();
  });

  it("ignores malformed stored JSON", () => {
    localStorage.setItem("smsgate2_session_v1", "not-json");
    expect(loadSession()).toBeNull();
  });
});

describe("password reset and login flows", () => {
  beforeEach(() => {
    localStorage.clear();
    enqueueJob.mockReset();
    smtpEnabledMock.mockReturnValue(true);
    mockFetch.mockReset();
  });

  it("rejects password reset when SMTP disabled", async () => {
    smtpEnabledMock.mockReturnValue(false);
    const res = await requestPasswordReset("x@example.com");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/SMTP disabled/i);
  });

  it("enqueues password reset when SMTP enabled", async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}), text: async () => "" });
    enqueueJob.mockImplementation(async (fn) => fn());
    const res = await requestPasswordReset("x@example.com");
    expect(res.ok).toBe(true);
    expect(enqueueJob).toHaveBeenCalled();
  });

  it("handles simple login with password change requirement", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ requiresPasswordChange: true, passwordChangeToken: "t" }),
      text: async () => ""
    });
    const res = await loginSimple("u", "p");
    expect(res.requiresPasswordChange).toBe(true);
    expect(res.session).toBeUndefined();
  });

  it("saves session on domain login", async () => {
    const session: Session = {
      accessToken: "t",
      expiresAt: Date.now() + 1000,
      user: { id: "1", name: "d", role: "admin", authMode: "domain_signin" }
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ session }), text: async () => "" });
    const res = await loginDomain("u", "p");
    expect(res.session).toEqual(session);
    expect(loadSession()).toEqual(session);
  });
});

describe("refresh and logout", () => {
  const session: Session = {
    accessToken: "token",
    expiresAt: Date.now() + 1000,
    user: { id: "1", name: "Test", role: "admin", authMode: "oauth" }
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mockFetch.mockReset();
  });

  it("clears session when refresh fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({}), text: async () => "boom" });
    saveSession(session);
    const res = await refreshSession("r");
    expect(res).toBeNull();
    expect(loadSession()).toBeNull();
  });

  it("saves refreshed session on success", async () => {
    const refreshed = { ...session, accessToken: "new" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ session: refreshed }),
      text: async () => ""
    });
    const res = await refreshSession("r");
    expect(res).toEqual(refreshed);
    expect(loadSession()).toEqual(refreshed);
  });

  it("best-effort logout even if API fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}), text: async () => "" });
    saveSession(session);
    await logout();
    expect(loadSession()).toBeNull();
  });
});

describe("oauth helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds authorize url and stores verifier", async () => {
    // Stable crypto for deterministic code verifier/challenge
    const randomBytes = new Uint8Array(32).fill(1);
    const digest = new Uint8Array(32).fill(2);
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      arr.set(randomBytes);
      return arr;
    });
    const digestMock = vi.fn(async () => digest.buffer);
    vi.stubGlobal("crypto", {
      getRandomValues,
      subtle: { digest: digestMock },
      randomUUID: () => "uuid"
    } as any);

    const url = await buildOAuthAuthorizeUrl("http://localhost/cb", "client");
    expect(url).toContain("client_id=client");
    expect(url).toContain("redirect_uri=http%3A%2F%2Flocalhost%2Fcb");
    expect(localStorage.getItem("smsgate2_pkce_verifier")).toBeTruthy();
    expect(digestMock).toHaveBeenCalled();
  });

  it("exchanges oauth code using stored verifier", async () => {
    localStorage.setItem("smsgate2_pkce_verifier", "verifier");
    const session: Session = {
      accessToken: "tok",
      expiresAt: Date.now() + 1000,
      user: { id: "1", name: "o", role: "admin", authMode: "oauth" }
    };
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ session }), text: async () => "" });
    const res = await exchangeOAuthCode("code", "http://cb");
    expect(res).toEqual(session);
    expect(localStorage.getItem("smsgate2_pkce_verifier")).toBeNull();
  });

  it("throws when verifier missing", async () => {
    await expect(exchangeOAuthCode("code", "http://cb")).rejects.toThrow(/verifier/i);
  });
});

describe("misc helpers", () => {
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
    expect(headers["X-WS-Endpoint"]).toBe("ws://example/ws");
  });

  it("returns empty headers when session missing", () => {
    expect(wsAuthHeaders(null)).toEqual({});
  });
});
