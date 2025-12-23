import fs from "fs";
import path from "path";

type PathSegments = string[];

/**
 * Loads configuration from the first available JSON file, preferring user files over envs.
 */
function loadFileConfig(): Record<string, unknown> {
  const candidates = [
    process.env.SMSGATE_CONFIG_FILE,
    path.join(process.cwd(), "config.local.json"),
    path.join(process.cwd(), "config.local.example.json")
  ].filter(Boolean) as string[];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      if (!raw.trim()) continue;
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to read config file", filePath, err);
    }
  }
  return {};
}

const fileConfig = loadFileConfig();

function readFromConfig(pathSegments: PathSegments): unknown {
  let cursor: unknown = fileConfig;
  for (const key of pathSegments) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function parseBoolSetting(envKey: string, cfgPath: PathSegments, fallback: boolean): boolean {
  const cfgVal = readFromConfig(cfgPath);
  if (typeof cfgVal === "boolean") return cfgVal;
  if (typeof cfgVal === "string") return cfgVal === "true" || cfgVal === "1";
  const envVal = process.env[envKey];
  if (envVal !== undefined) return envVal === "true" || envVal === "1";
  return fallback;
}

function parseNumberSetting(envKey: string, cfgPath: PathSegments, fallback: number): number {
  const cfgVal = readFromConfig(cfgPath);
  const parsedCfg = typeof cfgVal === "number" ? cfgVal : Number(cfgVal);
  if (Number.isFinite(parsedCfg)) return parsedCfg;
  const envVal = process.env[envKey];
  if (envVal !== undefined) {
    const parsed = Number(envVal);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function parseListSetting(envKey: string, cfgPath: PathSegments, fallback: string[]): string[] {
  const cfgVal = readFromConfig(cfgPath);
  if (Array.isArray(cfgVal)) return cfgVal.map((item) => String(item).trim()).filter(Boolean);
  if (typeof cfgVal === "string") return cfgVal.split(",").map((item) => item.trim()).filter(Boolean);
  const envVal = process.env[envKey];
  if (envVal !== undefined) {
    return envVal.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return fallback;
}

function parseStringSetting(envKey: string, cfgPath: PathSegments, fallback: string): string {
  const cfgVal = readFromConfig(cfgPath);
  if (typeof cfgVal === "string") return cfgVal;
  const envVal = process.env[envKey];
  if (envVal !== undefined) return envVal;
  return fallback;
}

/**
 * Server configuration derived from environment variables.
 */
export const serverConfig = {
  authorization: {
    token: {
      clientId: parseListSetting("SMSGATE_CLIENT_IDS", ["authorization", "token", "clientId"], ["#XCLIENTID1"]),
      accessCode: parseListSetting("SMSGATE_ACCESS_CODES", ["authorization", "token", "accessCode"], ["#PIN1", "#PIN2"]),
      hashedCode: [] as string[],
      useHashed: parseBoolSetting("SMSGATE_USE_HASHED", ["authorization", "token", "useHashed"], false)
    },
    salt: parseStringSetting("SMSGATE_SALT", ["authorization", "salt"], "#SALT")
  },
  security: {
    login: {
      maxAttempts: parseNumberSetting("SMSGATE_LOGIN_MAX_ATTEMPTS", ["security", "login", "maxAttempts"], 8),
      windowMs: parseNumberSetting("SMSGATE_LOGIN_WINDOW_MS", ["security", "login", "windowMs"], 10 * 60 * 1000),
      lockoutMs: parseNumberSetting("SMSGATE_LOGIN_LOCKOUT_MS", ["security", "login", "lockoutMs"], 15 * 60 * 1000),
      baseDelayMs: parseNumberSetting("SMSGATE_LOGIN_BASE_DELAY_MS", ["security", "login", "baseDelayMs"], 350),
      maxDelayMs: parseNumberSetting("SMSGATE_LOGIN_MAX_DELAY_MS", ["security", "login", "maxDelayMs"], 4000)
    }
  },
  server: {
    port: parseNumberSetting("SMSGATE_PORT", ["server", "port"], 3000),
    wsPath: parseStringSetting("SMSGATE_WS_PATH", ["server", "wsPath"], "/ws")
  },
  management: {
    messages: {
      keep: parseNumberSetting("SMSGATE_MESSAGES_KEEP", ["management", "messages", "keep"], 10),
      purgeOld: parseBoolSetting("SMSGATE_MESSAGES_PURGE", ["management", "messages", "purgeOld"], true)
    }
  },
  http: {
    enableLegacyPush: parseBoolSetting("SMSGATE_HTTP_LEGACY_PUSH", ["http", "enableLegacyPush"], false),
    enableSync: parseBoolSetting("SMSGATE_HTTP_SYNC", ["http", "enableSync"], false)
  },
  persistence: {
    type: parseStringSetting("SMSGATE_PERSISTENCE_TYPE", ["persistence", "type"], "memory") as "memory" | "json",
    filePath: parseStringSetting("SMSGATE_PERSISTENCE_FILE", ["persistence", "filePath"], path.join(process.cwd(), "data", "messages.json"))
  }
};
