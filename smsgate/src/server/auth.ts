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
  if (serverConfig.authorization.token.useHashed) {
    return;
  }
  serverConfig.authorization.token.hashedCode = serverConfig.authorization.token.accessCode.map(
    (code) => hashToken(code)
  );
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
