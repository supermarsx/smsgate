import { describe, expect, it, beforeEach, vi } from "vitest";

describe("config extended", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/api/v1",
      NEXT_PUBLIC_WS_PATH: "/api/v1/ws",
      NEXT_PUBLIC_WS_ORIGIN: "http://localhost:4000",
      NEXT_PUBLIC_LOCALE_DEFAULT: "en-US"
    };
  });

  it("honors allowOfflineAdmin default in non-production", async () => {
    const { appConfig } = await import("../lib/config");
    expect(appConfig.allowOfflineAdmin).toBe(true);
  });

  it("disables allowOfflineAdmin when env forces false", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_ALLOW_OFFLINE_ADMIN = "false";
    const { appConfig } = await import("../lib/config");
    expect(appConfig.allowOfflineAdmin).toBe(false);
  });

  it("uses env primary auth when valid", async () => {
    process.env.NEXT_PUBLIC_AUTH_PRIMARY = "domain_signin";
    const { appConfig } = await import("../lib/config");
    expect(appConfig.primaryAuthMode).toBe("domain_signin");
  });

  it("falls back to default locale list when missing", async () => {
    delete process.env.NEXT_PUBLIC_LOCALE_DEFAULT;
    const { appConfig } = await import("../lib/config");
    expect(appConfig.locales).toEqual(expect.arrayContaining(["en-US"]));
    expect(appConfig.defaultLocale).toBe("en-US");
  });
});
