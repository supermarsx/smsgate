import { describe, expect, it, vi, beforeEach } from "vitest";

import { http } from "../lib/http";
import type { Session } from "../lib/auth";

const session: Session = {
  accessToken: "token-1",
  expiresAt: Date.now() + 1000,
  user: { id: "u1", name: "Test", role: "admin", authMode: "oauth" }
};

describe("http wrapper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends auth headers and parses json", async () => {
    const fetchMock = vi.fn(async (_url, init: any) => {
      expect(init?.headers?.Authorization).toBe("Bearer token-1");
      expect(init?.headers?.["x-correlation-id"]).toBeDefined();
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true })
      };
    });
    (globalThis as any).fetch = fetchMock;
    const res = await http<{ ok: boolean }>(session, "/ping");
    expect(res.ok).toBe(true);
  });

  it("normalizes error responses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      headers: { get: () => "E_DENIED" },
      text: async () => '{"message":"nope","code":"E_DENIED"}'
    }));
    (globalThis as any).fetch = fetchMock;
    await expect(http(session, "/forbidden")).rejects.toMatchObject({
      status: 403,
      message: "nope",
      code: "E_DENIED"
    });
  });
});
