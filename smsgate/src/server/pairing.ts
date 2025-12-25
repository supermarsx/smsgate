import fs from "fs";
import path from "path";
import crypto from "crypto";
import { serverConfig } from "../config";

export type PairingConfig = {
  clientId: string;
  pin: string;
  salt: string;
  pairingSecret: string;
  createdAt: string;
};

const PAIRING_FILE = serverConfig.pairing.filePath;
const pairingEnabled = serverConfig.pairing.enable;

function generatePin(): string {
  const value = crypto.randomInt(100000, 999999);
  return String(value);
}

function generateSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

function generateClientId(): string {
  return `device-${crypto.randomBytes(4).toString("hex")}`;
}

function generatePairingSecret(): string {
  return crypto.randomBytes(16).toString("hex");
}

function isDefaultSecrets(): boolean {
  return (
    serverConfig.authorization.salt === "#SALT" ||
    serverConfig.authorization.token.accessCode.includes("#PIN1") ||
    serverConfig.authorization.token.clientId.includes("#XCLIENTID1")
  );
}

function loadPairingFile(): PairingConfig | null {
  if (!fs.existsSync(PAIRING_FILE)) return null;
  try {
    const raw = fs.readFileSync(PAIRING_FILE, "utf-8");
    return JSON.parse(raw) as PairingConfig;
  } catch {
    return null;
  }
}

function persistPairingFile(config: PairingConfig): void {
  const dir = path.dirname(PAIRING_FILE);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PAIRING_FILE, JSON.stringify(config, null, 2));
}

function buildPairingConfig(existing?: PairingConfig | null): PairingConfig {
  const envClientId = process.env.SMSGATE_PAIRING_CLIENT_ID?.trim();
  const envPin = process.env.SMSGATE_PAIRING_PIN?.trim();
  const envSalt = process.env.SMSGATE_PAIRING_SALT?.trim();
  const envSecret = process.env.SMSGATE_PAIRING_SECRET?.trim();

  return {
    clientId: envClientId || existing?.clientId || generateClientId(),
    pin: envPin || existing?.pin || generatePin(),
    salt: envSalt || existing?.salt || generateSalt(),
    pairingSecret: envSecret || existing?.pairingSecret || generatePairingSecret(),
    createdAt: existing?.createdAt || new Date().toISOString()
  };
}

export function ensurePairingConfig(): PairingConfig {
  const existing = loadPairingFile();
  const config = buildPairingConfig(existing);
  if (!existing || JSON.stringify(existing) !== JSON.stringify(config)) {
    persistPairingFile(config);
  }

  if (pairingEnabled && isDefaultSecrets()) {
    serverConfig.authorization.token.accessCode = [config.pin];
    serverConfig.authorization.token.clientId = [config.clientId];
    serverConfig.authorization.salt = config.salt;
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log("[pairing] Applied pairing secrets because defaults were detected.");
    }
  } else {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(
        "[pairing] Pairing overrides disabled; keeping configured web auth secrets (pairing enable flag:",
        pairingEnabled,
        ")"
      );
    }
  }

  return config;
}

export function rollPairingPin(previous: PairingConfig): PairingConfig {
  const updated: PairingConfig = {
    ...previous,
    pin: generatePin(),
    salt: generateSalt(),
    createdAt: new Date().toISOString()
  };

  persistPairingFile(updated);

  if (pairingEnabled && isDefaultSecrets()) {
    serverConfig.authorization.token.accessCode = [updated.pin];
    serverConfig.authorization.token.clientId = [updated.clientId];
    serverConfig.authorization.salt = updated.salt;
    // Refresh hashed tokens to keep auth aligned with rolled pairing secrets.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("./auth").initializeTokens();
  }

  const runtime = global.__SMSGATE_RUNTIME__;
  if (runtime) {
    runtime.pairingConfig = updated;
    if (pairingEnabled && isDefaultSecrets()) {
      runtime.authorization = serverConfig.authorization;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[pairing] Rolled pairing PIN", { clientId: updated.clientId, pin: updated.pin });
  }

  return updated;
}

const PAIRING_WINDOW_SECONDS = 60;

export function getRollingPairingCode(secret: string, now: number = Date.now()): string {
  const window = Math.floor(now / 1000 / PAIRING_WINDOW_SECONDS);
  const digest = crypto.createHmac("sha256", secret).update(String(window)).digest("hex");
  const numeric = parseInt(digest.slice(0, 8), 16);
  const code = (numeric % 1000000).toString().padStart(6, "0");
  return code;
}

export function verifyRollingPairingCode(secret: string, code: string): boolean {
  if (!code || code.length < 4) return false;
  const now = Date.now();
  const current = getRollingPairingCode(secret, now);
  const previous = getRollingPairingCode(secret, now - PAIRING_WINDOW_SECONDS * 1000);
  return code === current || code === previous;
}
