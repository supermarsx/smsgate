/**
 * @file API endpoint that validates login tokens with rate limiting, proxy-aware client keys, and invisible bot challenges.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "../../../server/runtime";
import { isValidToken } from "../../../server/auth";
import { delay, extractClientKey, isBrowserProofValid } from "../../../server/loginGuard";

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

  if (botField.trim()) {
    guard.recordFailure(clientKey);
    res.status(400).send("Bot detected");
    return;
  }

  if (!isBrowserProofValid(req, browserProof)) {
    guard.recordFailure(clientKey);
    res.status(400).send("Bot detected");
    return;
  }

  if (isValidToken(token)) {
    guard.recordSuccess(clientKey);
    res.status(200).send("Valid token");
    return;
  }

  const failure = guard.recordFailure(clientKey);
  if (failure.blocked) {
    if (failure.retryAfterMs) {
      res.setHeader("Retry-After", Math.ceil(failure.retryAfterMs / 1000).toString());
    }
    res.status(429).send("Too many attempts");
    return;
  }

  res.status(200).send("Invalid token");
}
