import { describe, expect, it, vi, beforeEach } from "vitest";

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000/api/v1";
    process.env.NEXT_PUBLIC_WS_PATH = "/api/v1/ws";
    process.env.NEXT_PUBLIC_WS_ORIGIN = "http://localhost:4000";
    process.env.NEXT_PUBLIC_LOCALE_DEFAULT = "en-US";
    delete process.env.NEXT_PUBLIC_QR_ORIGIN;
  });

  it("builds ws url using origin override", async () => {
    const { wsUrl } = await import("../lib/config");
    expect(wsUrl()).toBe("ws://localhost:4000/api/v1/ws");
  });

  it("rejects invalid api url values", async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http:::/bad";
    await expect(import("../lib/config")).rejects.toThrow(/Invalid API base URL/);
  });

  it("leaves relative qr origin untouched", async () => {
    process.env.NEXT_PUBLIC_QR_ORIGIN = "/internal/qr";
    const { appConfig } = await import("../lib/config");
    expect(appConfig.qrOrigin).toBe("/internal/qr");
  });
});
