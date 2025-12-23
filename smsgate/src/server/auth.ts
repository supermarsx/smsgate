import crypto from "crypto";
import { serverConfig } from "../config";

/**
 * Hashes an access code with the configured salt.
 */
function hashToken(input: string): string {
  return crypto
    .createHash("sha512")
    .update(input + serverConfig.authorization.salt)
    .digest("hex");
}

/**
 * Initializes hashed tokens when plaintext codes are configured.
 */
export function initializeTokens(): void {
  const accessCodes = serverConfig.authorization.token.accessCode;
  const looksHashed = accessCodes.every((code) => /^[a-f0-9]{128}$/i.test(code));

  serverConfig.authorization.token.hashedCode = looksHashed
    ? accessCodes
    : accessCodes.map((code) => hashToken(code));

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[auth] Loaded", serverConfig.authorization.token.hashedCode.length, "login tokens");
    // eslint-disable-next-line no-console
    console.log("[auth] Salt:", serverConfig.authorization.salt);
  }
}

/**
 * Validates an incoming token against the configured list.
 */
export function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const tokens = serverConfig.authorization.token.hashedCode;
  return tokens.includes(token);
}

/**
 * Checks whether a client id belongs to an allowed phone device.
 */
export function isValidClientId(clientId: string | undefined): boolean {
  if (!clientId) return false;
  return serverConfig.authorization.token.clientId.includes(clientId);
}
