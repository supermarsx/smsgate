/**
 * Lightweight SMTP task queue so email work does not block the UI thread.
 * Jobs are run sequentially in a macrotask, letting the UI stay responsive.
 */
import { appConfig } from "./config";

/**
 * True when SMTP is enabled in config (default on).
 */
export function smtpEnabled(): boolean {
  const smtp = appConfig.smtp;
  return Boolean(smtp && (smtp.enabled ?? true));
}

/**
 * True when TLS verification may be bypassed for SMTP (insecure; default off).
 */
export function smtpAllowsInvalidCert(): boolean {
  const smtp = appConfig.smtp;
  return Boolean(smtp && (smtp.allowInvalidCert ?? false));
}

type Job = {
  run: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

const queue: Job[] = [];
let draining = false;

/**
 * Enqueue an async SMTP job. Rejects immediately if SMTP is disabled.
 * @param job Job function to run sequentially.
 */
export function enqueueSmtpJob<T>(job: () => Promise<T>): Promise<T> {
  if (!smtpEnabled()) {
    return Promise.reject(new Error("SMTP is disabled by configuration"));
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({
      run: job,
      resolve: resolve as (value: unknown) => void,
      reject
    });
    scheduleDrain();
  });
}

function scheduleDrain(): void {
  if (draining) return;
  draining = true;
  // Run in a macrotask to keep the main render path responsive.
  setTimeout(drainQueue, 0);
}

async function drainQueue(): Promise<void> {
  while (queue.length) {
    const { run, resolve, reject } = queue.shift()!;
    try {
      const result = await run();
      resolve(result);
    } catch (err) {
      reject(err);
    }
  }
  draining = false;
}

/**
 * Observability helper for tests and telemetry.
 */
export function smtpQueueDepth(): number {
  return queue.length;
}
