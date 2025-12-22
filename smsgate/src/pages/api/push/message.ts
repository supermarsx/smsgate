import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "../../../server/runtime";
import { isValidClientId, isValidToken } from "../../../server/auth";
import { sanitizeStr } from "../../../server/sanitize";
import { broadcast } from "../../../server/wsHub";
import { MessageRecord } from "../../../server/types";
import crypto from "crypto";
import { serverConfig } from "../../../config";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!serverConfig.http.enableLegacyPush) {
    res.status(404).end();
    return;
  }
  const runtime = getRuntime();
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.split(" ")[1];
  const rawClientId = req.headers["x-clientid"];
  const clientId = Array.isArray(rawClientId) ? rawClientId[0] : rawClientId;

  if (!isValidToken(token) || !isValidClientId(clientId)) {
    res.status(200).end();
    return;
  }

  const body = req.body ?? {};
  const message: MessageRecord = {
    number: sanitizeStr(String(body.number ?? "")),
    date: sanitizeStr(String(body.date ?? "")),
    message: sanitizeStr(String(body.message ?? "")),
    receivedAtEpochMs: body.receivedAtEpochMs ? Number(body.receivedAtEpochMs) : undefined,
    deviceManufacturer: body.deviceManufacturer ? String(body.deviceManufacturer) : undefined,
    deviceModel: body.deviceModel ? String(body.deviceModel) : undefined,
    deviceSdkInt: body.deviceSdkInt ? Number(body.deviceSdkInt) : undefined
  };

  await runtime.store.addMessage(message);
  broadcast({ type: "message", payload: message });
  const messages = await runtime.store.getMessages();
  const hash = crypto.createHash("sha512").update(JSON.stringify(messages)).digest("hex");
  broadcast({ type: "syncHash", payload: hash });
  res.status(200).end();
}
