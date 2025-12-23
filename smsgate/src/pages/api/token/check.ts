/**
 * @file API endpoint that validates login tokens with rate limiting, proxy-aware client keys, and invisible bot challenges.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "../../../server/runtime";
import { isValidToken } from "../../../server/auth";
import { serverConfig } from "../../../config";
import { delay, extractClientKey, isBrowserProofValid } from "../../../server/loginGuard";

const authDebug = process.env.SMSGATE_AUTH_DEBUG !== "false";

function logDebug(...args: unknown[]): void {
  if (!authDebug) return;
  // eslint-disable-next-line no-console
  console.log("[auth]", ...args);
}

function maskToken(token: string | undefined): string {
  if (!token) return "<empty>";
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

/**
 * Validates a token with anti-bot and anti-bruteforce protections.
 * @param req Incoming request containing the bearer token and optional proof fields.
 * @param res Outgoing response that returns validation status.
 * @returns Promise that resolves when the response has been sent.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const runtime = getRuntime();
  const guard = runtime.loginGuard;
  const clientKey = extractClientKey(req);
  const assessment = guard.assess(clientKey);

  logDebug("token/check assess", { clientKey, blocked: assessment.blocked, delayMs: assessment.delayMs, retryAfterMs: assessment.retryAfterMs });

  if (assessment.blocked) {
    if (assessment.retryAfterMs) {
      res.setHeader("Retry-After", Math.ceil(assessment.retryAfterMs / 1000).toString());
    }
    res.status(429).send("Too many attempts");
    return;
  }

  await delay(assessment.delayMs);

  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.split(" ")[1];
  const botField = typeof req.body?.botField === "string" ? req.body.botField : "";
  const browserProof = typeof req.body?.browserProof === "string" ? req.body.browserProof : "";

  logDebug("token/check request", {
    clientKey,
    hasToken: Boolean(token),
    tokenMasked: maskToken(token),
    botFieldLength: botField.length,
    browserProofLength: browserProof.length,
    knownTokens: runtime.authorization?.token?.hashedCode
      ? (runtime.authorization.token.hashedCode as string[]).map((t) => maskToken(t))
      : "<unknown>",
    serverConfigTokens: (serverConfig.authorization.token.hashedCode || []).map((t) => maskToken(String(t))),
    lengths: {
      token: token?.length ?? 0,
      runtimeTokens: runtime.authorization?.token?.hashedCode?.map((t) => String(t).length) || [],
      serverTokens: serverConfig.authorization.token.hashedCode.map((t) => String(t).length)
    }
  });

  if (botField.trim()) {
    guard.recordFailure(clientKey);
    logDebug("token/check botField tripped", { clientKey });
    res.status(400).send("Bot detected");
    return;
  }

  if (!isBrowserProofValid(req, browserProof)) {
    guard.recordFailure(clientKey);
    logDebug("token/check browserProof invalid", { clientKey });
    res.status(400).send("Bot detected");
    return;
  }

  if (isValidToken(token)) {
    guard.recordSuccess(clientKey);
    logDebug("token/check success", { clientKey });
    res.status(200).send("Valid token");
    return;
  }

  const serverTokens = serverConfig.authorization.token.hashedCode;
  const runtimeTokens = runtime.authorization?.token?.hashedCode as string[] | undefined;
  const equalityCheckServer = serverTokens.map((t) => ({ match: t === token, token: maskToken(t) }));
  const equalityCheckRuntime = (runtimeTokens || []).map((t) => ({ match: t === token, token: maskToken(t) }));
  logDebug("token/check equality", {
    tokenMasked: maskToken(token),
    serverMatches: equalityCheckServer.filter((x) => x.match),
    runtimeMatches: equalityCheckRuntime.filter((x) => x.match)
  });

  const failure = guard.recordFailure(clientKey);
  logDebug("token/check failure", { clientKey, blocked: failure.blocked, retryAfterMs: failure.retryAfterMs });
  if (failure.blocked) {
    if (failure.retryAfterMs) {
      res.setHeader("Retry-After", Math.ceil(failure.retryAfterMs / 1000).toString());
    }
    res.status(429).send("Too many attempts");
    return;
  }

  res.status(200).send("Invalid token");
}
