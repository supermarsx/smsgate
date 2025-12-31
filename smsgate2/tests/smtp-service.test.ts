import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

describe("smtp service", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    process.env = {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/api/v1",
      NEXT_PUBLIC_WS_PATH: "/api/v1/ws",
      NEXT_PUBLIC_WS_ORIGIN: "http://localhost:4000",
      NEXT_PUBLIC_LOCALE_DEFAULT: "en-US",
      NEXT_PUBLIC_SMTP_ENABLED: "true",
      NEXT_PUBLIC_SMTP_ALLOW_INVALID_CERT: "false"
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects enqueue when smtp is disabled", async () => {
    process.env.NEXT_PUBLIC_SMTP_ENABLED = "false";
    const { enqueueSmtpJob } = await import("../lib/smtp-service");
    await expect(enqueueSmtpJob(async () => "noop")).rejects.toThrow(/SMTP is disabled/);
  });

  it("runs queued jobs sequentially", async () => {
    const { enqueueSmtpJob, smtpQueueDepth } = await import("../lib/smtp-service");

    const order: number[] = [];
    const job = (id: number) => async () => {
      order.push(id);
      return id;
    };

    const p1 = enqueueSmtpJob(job(1));
    const p2 = enqueueSmtpJob(job(2));

    expect(smtpQueueDepth()).toBe(2);
    await vi.runAllTimersAsync();

    expect(await p1).toBe(1);
    expect(await p2).toBe(2);
    expect(order).toEqual([1, 2]);
    expect(smtpQueueDepth()).toBe(0);
  });

  it("reflects allowInvalidCert flag", async () => {
    process.env.NEXT_PUBLIC_SMTP_ALLOW_INVALID_CERT = "true";
    const { smtpAllowsInvalidCert } = await import("../lib/smtp-service");
    expect(smtpAllowsInvalidCert()).toBe(true);
  });
});
