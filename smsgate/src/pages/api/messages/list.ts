import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "../../../server/runtime";
import { isValidToken } from "../../../server/auth";
import { serverConfig } from "../../../config";

/**
 * Returns all stored messages for HTTP sync clients.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!serverConfig.http.enableSync) {
    res.status(404).end();
    return;
  }
  const runtime = getRuntime();
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.split(" ")[1];

  if (!isValidToken(token)) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const messages = await runtime.store.getMessages();
  res.status(200).json({ messages });
}
