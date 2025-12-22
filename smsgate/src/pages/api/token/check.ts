import type { NextApiRequest, NextApiResponse } from "next";
import { getRuntime } from "../../../server/runtime";
import { isValidToken } from "../../../server/auth";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  getRuntime();
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.split(" ")[1];

  if (isValidToken(token)) {
    res.status(200).send("Valid token");
    return;
  }
  res.status(200).send("Invalid token");
}
