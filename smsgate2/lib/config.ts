type AuthModes = {
  oauth: boolean;
  simpleSignin: boolean;
  domainSignin: boolean;
};

export type AppConfig = {
  apiBaseUrl: string;
  wsPath: string;
  wsOrigin?: string;
  authModes: AuthModes;
  locales: string[];
  defaultLocale: string;
};

const boolEnv = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
};

const strEnv = (key: string, fallback: string): string => {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return fallback;
  return raw.trim();
};

function validateUrlish(value: string, label: string): string {
  try {
    // Accept relative paths by allowing URL construction to fail; only check non-empty.
    if (!value.startsWith("http")) return value;
    new URL(value);
    return value;
  } catch {
    throw new Error(`[config] Invalid ${label}: ${value}`);
  }
}

function buildConfig(): AppConfig {
  const apiBaseUrl = validateUrlish(strEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4000/api/v1"), "API base URL");
  const wsPath = strEnv("NEXT_PUBLIC_WS_PATH", "/api/v1/ws");
  const wsOrigin = strEnv("NEXT_PUBLIC_WS_ORIGIN", "");
  const locales = ["en-US", "pt-PT", "es-ES"];
  const defaultLocale = locales.includes(strEnv("NEXT_PUBLIC_LOCALE_DEFAULT", "en-US"))
    ? strEnv("NEXT_PUBLIC_LOCALE_DEFAULT", "en-US")
    : "en-US";

  const authModes: AuthModes = {
    oauth: boolEnv("NEXT_PUBLIC_AUTH_OAUTH", true),
    simpleSignin: boolEnv("NEXT_PUBLIC_AUTH_SIMPLE_SIGNIN", true),
    domainSignin: boolEnv("NEXT_PUBLIC_AUTH_DOMAIN_SIGNIN", false)
  };

  return {
    apiBaseUrl,
    wsPath,
    wsOrigin: wsOrigin || undefined,
    authModes,
    locales,
    defaultLocale
  };
}

export const appConfig = buildConfig();

export function wsUrl(): string {
  const origin =
    appConfig.wsOrigin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return origin.replace(/^http/, "ws") + appConfig.wsPath;
}
