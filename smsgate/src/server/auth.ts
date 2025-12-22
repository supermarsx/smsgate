import crypto from "crypto";
import { serverConfig } from "../config";

function hashToken(input: string): string {
  return crypto
    .createHash("sha512")
    .update(input + serverConfig.authorization.salt)
    .digest("hex");
}

export function initializeTokens(): void {
  if (serverConfig.authorization.token.useHashed) {
    return;
  }
  serverConfig.authorization.token.hashedCode = serverConfig.authorization.token.accessCode.map(
    (code) => hashToken(code)
  );
}

export function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const tokens = serverConfig.authorization.token.hashedCode;
  return tokens.includes(token);
}

export function isValidClientId(clientId: string | undefined): boolean {
  if (!clientId) return false;
  return serverConfig.authorization.token.clientId.includes(clientId);
}
