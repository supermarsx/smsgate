type AuthModes = {
  oauth: boolean;
  simpleSignin: boolean;
  domainSignin: boolean;
};

export type AppConfig = {
  apiBaseUrl: string;
  wsPath: string;
  wsOrigin?: string;
  qrOrigin?: string;
  primaryAuthMode?: "oauth" | "simple_signin" | "domain_signin";
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
    fromEmail?: string;
  };
  offlineReset?: {
    enabled: boolean;
    defaultAdminUsername?: string;
    defaultAdminPassword?: string;
  };
  authModes: AuthModes;
  locales: string[];
  defaultLocale: string;
};

import baseFileConfigJson from "../config/app.config.json";
import devFileConfigJson from "../config/app.config.dev.json";

type FileConfig = Partial<AppConfig> & { primaryAuthMode?: string };
const baseFileConfig: FileConfig = (baseFileConfigJson as unknown as FileConfig) ?? {};
const devFileConfig: FileConfig = (devFileConfigJson as unknown as FileConfig) ?? {};

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
  const mergedFileConfig: FileConfig = {
    ...baseFileConfig,
    ...(process.env.NODE_ENV !== "production" ? devFileConfig : {})
  };
  const locales =
    Array.isArray(mergedFileConfig.locales) && mergedFileConfig.locales.length
      ? mergedFileConfig.locales
      : ["en-US", "pt-PT", "es-ES"];
  const apiBaseUrl = validateUrlish(
    strEnv("NEXT_PUBLIC_API_BASE_URL", mergedFileConfig.apiBaseUrl ?? "http://localhost:4000/api/v1"),
    "API base URL"
  );
  const wsPath = strEnv("NEXT_PUBLIC_WS_PATH", mergedFileConfig.wsPath ?? "/api/v1/ws");
  const wsOrigin = strEnv("NEXT_PUBLIC_WS_ORIGIN", mergedFileConfig.wsOrigin ?? "");
  const qrOrigin = strEnv("NEXT_PUBLIC_QR_ORIGIN", mergedFileConfig.qrOrigin ?? "");
  const envLocale = strEnv("NEXT_PUBLIC_LOCALE_DEFAULT", mergedFileConfig.defaultLocale ?? "en-US");
  const defaultLocale = locales.includes(envLocale) ? envLocale : "en-US";

  const authModes: AuthModes = {
    oauth: boolEnv("NEXT_PUBLIC_AUTH_OAUTH", mergedFileConfig.authModes?.oauth ?? true),
    simpleSignin: boolEnv("NEXT_PUBLIC_AUTH_SIMPLE_SIGNIN", mergedFileConfig.authModes?.simpleSignin ?? true),
    domainSignin: boolEnv("NEXT_PUBLIC_AUTH_DOMAIN_SIGNIN", mergedFileConfig.authModes?.domainSignin ?? false)
  };
  const primaryAuthModeEnv = strEnv("NEXT_PUBLIC_AUTH_PRIMARY", mergedFileConfig.primaryAuthMode ?? "");
  const primaryAuthMode = ["oauth", "simple_signin", "domain_signin"].includes(primaryAuthModeEnv)
    ? (primaryAuthModeEnv as AppConfig["primaryAuthMode"])
    : undefined;

  return {
    apiBaseUrl,
    wsPath,
    wsOrigin: wsOrigin || undefined,
    qrOrigin: qrOrigin || undefined,
    primaryAuthMode,
    smtp: mergedFileConfig.smtp,
    offlineReset: mergedFileConfig.offlineReset,
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
