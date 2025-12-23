import type { NextApiRequest, NextApiResponse } from "next";
import { serverConfig } from "../../config";
import { getRuntime } from "../../server/runtime";

function isPairingEnabled(): boolean {
  if (process.env.SMSGATE_DISCOVERY_DEV === "true") return true;
  return process.env.NODE_ENV !== "production";
}

function buildProvisionPayload(host: string, proto: string, runtime: ReturnType<typeof getRuntime>) {
  return {
    server: {
      url: `${proto}://${host}`,
      apiPath: "/api/push/message",
      method: "POST"
    },
    auth: {
      clientIdHeader: "x-clientid",
      clientId: runtime.pairingConfig.clientId,
      authHeader: "Authorization",
      authPrefix: "Bearer ",
      acceptHeader: "Accept",
      acceptValue: "application/json",
      contentTypeHeader: "Content-Type",
      contentTypeValue: "application/json",
      pin: runtime.pairingConfig.pin,
      salt: runtime.pairingConfig.salt
    },
    features: {
      enableListener: true,
      enableForegroundService: true,
      enableBootReceiver: true,
      enableSocketPresence: true,
      notificationEnabled: true
    },
    pairing: {
      codenameSeed: `${serverConfig.server.port}`,
      pairingCode: runtime.pairingCode
    }
  };
}

/**
 * Development-only pairing endpoint for QR and local discovery.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!isPairingEnabled()) {
    res.status(404).end();
    return;
  }

  const runtime = getRuntime();
  const code = String(req.query.code ?? "");
  if (!code || code !== runtime.pairingCode) {
    res.status(401).json({ error: "Invalid pairing code" });
    return;
  }

  const host = req.headers.host ?? "";
  const proto = (req.headers["x-forwarded-proto"] as string) ?? "http";
  if (!host) {
    res.status(400).json({ error: "Missing host" });
    return;
  }

  res.status(200).json(buildProvisionPayload(host, proto, runtime));
}
