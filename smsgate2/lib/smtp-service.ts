// Lightweight SMTP task queue so email work does not block the UI thread.
import { appConfig } from "./config";

export function smtpEnabled(): boolean {
  const smtp = appConfig.smtp;
  return Boolean(smtp && (smtp.enabled ?? true));
}

export function smtpAllowsInvalidCert(): boolean {
  const smtp = appConfig.smtp;
  return Boolean(smtp && (smtp.allowInvalidCert ?? false));
}

type Job<T> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const queue: Job<unknown>[] = [];
let draining = false;

export function enqueueSmtpJob<T>(job: () => Promise<T>): Promise<T> {
  if (!smtpEnabled()) {
    return Promise.reject(new Error("SMTP is disabled by configuration"));
  }

  return new Promise<T>((resolve, reject) => {
    queue.push({ run: job, resolve, reject });
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

export function smtpQueueDepth(): number {
  return queue.length;
}
