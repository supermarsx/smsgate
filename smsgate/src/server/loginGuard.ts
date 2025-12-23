/**
 * @file Rate-limits login attempts, extracts client identity behind proxies, and validates lightweight browser challenges.
 */

import crypto from "crypto";
import type { NextApiRequest } from "next";
import { serverConfig } from "../config";

const UNKNOWN_KEY = "unknown";
const PROOF_VERSION = "v1";

type AttemptState = {
  failures: number[];
  lockUntil?: number;
  lastSeen: number;
};

/**
 * Returns epoch milliseconds for easier testing/mocking.
 * @returns Current epoch time in milliseconds.
 */
function now(): number {
  return Date.now();
}

/**
 * Computes an exponential backoff delay in milliseconds.
 * @param failureCount Number of recent failures in the rolling window.
 * @returns Delay to apply before evaluating the next attempt.
 */
function backoffDelay(failureCount: number): number {
  if (!failureCount) return 0;
  const { baseDelayMs, maxDelayMs } = serverConfig.security.login;
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, failureCount - 1));
}

/**
 * Normalizes an identifier key, falling back to a stable placeholder when empty.
 * @param key Raw key (IP/user identifier) to normalize.
 * @returns Sanitized key usable in maps.
 */
function normalizeKey(key: string | undefined | null): string {
  if (!key) return UNKNOWN_KEY;
  return key.trim() || UNKNOWN_KEY;
}

/**
 * Removes stale failures and expired locks for a given attempt state.
 * @param state Mutable attempt state for a single client.
 * @param currentTime Epoch milliseconds used for comparisons.
 */
function purgeOldFailures(state: AttemptState, currentTime: number): void {
  const { windowMs } = serverConfig.security.login;
  state.failures = state.failures.filter((ts) => ts > currentTime - windowMs);
  if (state.lockUntil && state.lockUntil <= currentTime) {
    delete state.lockUntil;
  }
  state.lastSeen = currentTime;
}

/**
 * Returns the first IP-like value from forwarded headers.
 * @param header Raw header value possibly containing a CSV chain.
 * @returns First entry if present, otherwise undefined.
 */
function firstForwarded(header: string | string[] | undefined): string | undefined {
  if (Array.isArray(header) && header.length) return header[0]?.split(",")[0];
  if (typeof header === "string" && header.length) return header.split(",")[0];
  return undefined;
}

/**
 * Validates a browser-issued proof tying the attempt to a recent timestamp and user agent.
 * @param req Incoming request, used for UA and header extraction.
 * @param proof Serialized proof string from the client.
 * @returns True when proof matches expected structure and signature.
 */
export function isBrowserProofValid(req: NextApiRequest, proof: string | undefined): boolean {
  if (!proof || typeof proof !== "string") return false;
  const [version, tsStr, sig] = proof.split(":");
  if (version !== PROOF_VERSION || !tsStr || !sig) return false;

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;

  const nowMs = now();
  const maxSkewMs = 30_000;
  const maxAgeMs = 10 * 60 * 1000;

  if (ts > nowMs + maxSkewMs) return false;
  if (nowMs - ts > maxAgeMs) return false;

  const userAgent = req.headers["user-agent"] ?? "";
  const payload = `${userAgent}:${ts}`;
  const expected = crypto.createHash("sha256").update(payload).digest("hex");

  return sig === expected;
}

export class LoginGuard {
  private readonly attempts = new Map<string, AttemptState>();

  /**
   * Returns an existing attempt state or initializes a new one for the key.
   * @param key Normalized client identifier.
   */
  private getState(key: string): AttemptState {
    const normalized = normalizeKey(key);
    if (!this.attempts.has(normalized)) {
      this.attempts.set(normalized, { failures: [], lastSeen: now() });
    }
    return this.attempts.get(normalized)!;
  }

  /**
   * Cleans out stale entries to keep memory bounded.
   * @param currentTime Epoch milliseconds used to evaluate staleness.
   */
  private cleanup(currentTime: number): void {
    const { windowMs } = serverConfig.security.login;
    for (const [key, state] of this.attempts) {
      if (state.lockUntil && state.lockUntil > currentTime) continue;
      const isStale = !state.failures.length && currentTime - state.lastSeen > windowMs;
      if (isStale) {
        this.attempts.delete(key);
      }
    }
  }

  /**
   * Evaluates whether a client is currently blocked and recommends a delay.
   * @param key Client identifier (typically IP-derived).
   * @returns Block status and delay before processing.
   */
  assess(key: string): { blocked: boolean; retryAfterMs?: number; delayMs: number } {
    const state = this.getState(key);
    const currentTime = now();
    purgeOldFailures(state, currentTime);
    const { maxAttempts, lockoutMs } = serverConfig.security.login;

    if (state.lockUntil && state.lockUntil > currentTime) {
      const retryAfterMs = state.lockUntil - currentTime;
      return { blocked: true, retryAfterMs, delayMs: 0 };
    }

    if (state.failures.length >= maxAttempts) {
      state.lockUntil = currentTime + lockoutMs;
      state.failures = [];
      return { blocked: true, retryAfterMs: lockoutMs, delayMs: 0 };
    }

    return { blocked: false, delayMs: backoffDelay(state.failures.length) };
  }

  /**
   * Records a failed attempt and enforces lockouts when limits are exceeded.
   * @param key Client identifier (typically IP-derived).
   * @returns Block status after recording the failure.
   */
  recordFailure(key: string): { blocked: boolean; retryAfterMs?: number } {
    const state = this.getState(key);
    const currentTime = now();
    purgeOldFailures(state, currentTime);

    state.failures.push(currentTime);
    const { maxAttempts, lockoutMs } = serverConfig.security.login;
    if (state.failures.length > maxAttempts) {
      state.failures.shift();
    }

    if (state.failures.length >= maxAttempts) {
      state.lockUntil = currentTime + lockoutMs;
      this.cleanup(currentTime);
      return { blocked: true, retryAfterMs: lockoutMs };
    }

    this.cleanup(currentTime);
    return { blocked: false };
  }

  /**
   * Clears the attempt state for a client after a successful login.
   * @param key Client identifier (typically IP-derived).
   */
  recordSuccess(key: string): void {
    const normalized = normalizeKey(key);
    this.attempts.delete(normalized);
    this.cleanup(now());
  }
}

/**
 * Factory for a new login guard instance.
 * @returns Configured login guard.
 */
export function createLoginGuard(): LoginGuard {
  return new LoginGuard();
}

/**
 * Extracts a proxy-aware client key using standard headers and socket address.
 * @param req Incoming request containing forwarding headers.
 * @returns Normalized client identifier.
 */
export function extractClientKey(req: NextApiRequest): string {
  const forwarded = firstForwarded(req.headers["x-forwarded-for"]);
  if (forwarded) return normalizeKey(forwarded);

  const realIp = firstForwarded(req.headers["x-real-ip"]);
  if (realIp) return normalizeKey(realIp);

  const cloudflareIp = firstForwarded(req.headers["cf-connecting-ip"]);
  if (cloudflareIp) return normalizeKey(cloudflareIp);

  const remote = req.socket?.remoteAddress;
  if (remote) {
    return normalizeKey(remote.replace(/^::ffff:/, ""));
  }
  return UNKNOWN_KEY;
}

/**
 * Applies an async delay for backoff purposes.
 * @param ms Milliseconds to pause before continuing.
 * @returns Promise that resolves after the delay.
 */
export async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
