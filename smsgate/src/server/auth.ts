import crypto from "crypto";
import { serverConfig } from "../config";

/**
 * Hashes an access code with the provided salt using SHA-512.
 */
function hashWithSalt(input: string, salt: string): string {
  return crypto.createHash("sha512").update(input + salt).digest("hex");
}

/**
 * Initializes hashed tokens when plaintext codes are configured.
 */
export function initializeTokens(): void {
  const accessCodes = serverConfig.authorization.token.accessCode;
  const looksHashed = accessCodes.every((code) => /^[a-f0-9]{128}$/i.test(code));

  const serverSalt = serverConfig.authorization.salt;
  const clientSalt = process.env.NEXT_PUBLIC_SMS_SALT ?? serverSalt;
  const salts = Array.from(new Set([serverSalt, clientSalt]));

  const hashedVariants: string[] = [];

  if (looksHashed) {
    hashedVariants.push(...accessCodes);
  }

  for (const salt of salts) {
    hashedVariants.push(...accessCodes.map((code) => hashWithSalt(code, salt)));
  }

  serverConfig.authorization.token.hashedCode = Array.from(new Set(hashedVariants));

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[auth] Loaded", serverConfig.authorization.token.hashedCode.length, "login tokens");
    // eslint-disable-next-line no-console
    console.log("[auth] Salts used:", salts);
  }

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
