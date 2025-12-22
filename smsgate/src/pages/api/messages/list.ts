import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "../../../server/runtime";
import { isValidToken } from "../../../server/auth";

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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
