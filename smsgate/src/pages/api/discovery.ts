import type { NextApiRequest, NextApiResponse } from "next";
import os from "os";
import { serverConfig } from "../../config";
import { getServerCodename } from "../../server/codename";
import { getRuntime } from "../../server/runtime";
import { getRollingPairingCode } from "../../server/pairing";

function isDiscoveryEnabled(): boolean {
  if (process.env.SMSGATE_DISCOVERY_DEV === "true") return true;
  return process.env.NODE_ENV !== "production";
}

/**
 * Development-only discovery endpoint for local network scanning.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!isDiscoveryEnabled()) {
    res.status(404).end();
    return;
  }

  const runtime = getRuntime();
  const seed = `${os.hostname()}-${serverConfig.server.port}`;
  const codename = getServerCodename(seed);
  const host = req.headers.host ?? "";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  const rollingCode = getRollingPairingCode(runtime.pairingConfig.pairingSecret);
  const pairingUrl = host ? `${proto}://${host}/api/pairing?code=${rollingCode}` : "";
  res.status(200).json({
    codename,
    pairingUrl,
    pairingCode: rollingCode
  });
}
