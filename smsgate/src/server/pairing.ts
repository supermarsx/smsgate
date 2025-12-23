import fs from "fs";
import path from "path";
import crypto from "crypto";
import { serverConfig } from "../config";

export type PairingConfig = {
  clientId: string;
  pin: string;
  salt: string;
  createdAt: string;
};

const PAIRING_FILE = path.join(process.cwd(), "data", "pairing.json");

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

  return {
    clientId: envClientId || existing?.clientId || generateClientId(),
    pin: envPin || existing?.pin || generatePin(),
    salt: envSalt || existing?.salt || generateSalt(),
    createdAt: existing?.createdAt || new Date().toISOString()
  };
}

export function ensurePairingConfig(): PairingConfig {
  const existing = loadPairingFile();
  const config = buildPairingConfig(existing);
  if (!existing || JSON.stringify(existing) !== JSON.stringify(config)) {
    persistPairingFile(config);
  }

  if (isDefaultSecrets()) {
    serverConfig.authorization.token.accessCode = [config.pin];
    serverConfig.authorization.token.clientId = [config.clientId];
    serverConfig.authorization.salt = config.salt;
  }

  return config;
}

export function getPairingCode(): string {
  return process.env.SMSGATE_PAIRING_CODE?.trim() || String(crypto.randomInt(100000, 999999));
}
