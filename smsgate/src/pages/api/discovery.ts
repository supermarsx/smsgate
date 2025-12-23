import type { NextApiRequest, NextApiResponse } from "next";
import os from "os";
import { serverConfig } from "../../config";
import { getServerCodename } from "../../server/codename";

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

  const seed = `${os.hostname()}-${serverConfig.server.port}`;
  const codename = getServerCodename(seed);
  res.status(200).json({ codename });
}
