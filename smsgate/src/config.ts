import path from "path";

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export const serverConfig = {
  authorization: {
    token: {
      clientId: parseList(process.env.SMSGATE_CLIENT_IDS, ["#XCLIENTID1"]),
      accessCode: parseList(process.env.SMSGATE_ACCESS_CODES, ["#PIN1", "#PIN2"]),
      hashedCode: [] as string[],
      useHashed: parseBool(process.env.SMSGATE_USE_HASHED, false)
    },
    salt: process.env.SMSGATE_SALT ?? "#SALT"
  },
  server: {
    port: parseNumber(process.env.SMSGATE_PORT, 3000),
    wsPath: process.env.SMSGATE_WS_PATH ?? "/ws"
  },
  management: {
    messages: {
      keep: parseNumber(process.env.SMSGATE_MESSAGES_KEEP, 10),
      purgeOld: parseBool(process.env.SMSGATE_MESSAGES_PURGE, true)
    }
  },
  http: {
    enableLegacyPush: parseBool(process.env.SMSGATE_HTTP_LEGACY_PUSH, false),
    enableSync: parseBool(process.env.SMSGATE_HTTP_SYNC, false)
  },
  persistence: {
    type: (process.env.SMSGATE_PERSISTENCE_TYPE ?? "memory") as "memory" | "json",
    filePath: process.env.SMSGATE_PERSISTENCE_FILE ?? path.join(process.cwd(), "data", "messages.json")
  }
};
