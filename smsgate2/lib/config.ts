/**
 * Supported UI theme modes. These names align with the toggles in the shell.
 */
type ThemeChoice = "light" | "dark" | "system";

/**
 * Booleans that gate UI paths in the login shell.
 */
type AuthModes = {
  oauth: boolean;
  simpleSignin: boolean;
  domainSignin: boolean;
};

/**
 * Top-level runtime configuration consumed by the UI. Values come from JSON files and env vars.
 */
export type AppConfig = {
  apiBaseUrl: string;
  wsPath: string;
  wsOrigin?: string;
  qrOrigin?: string;
  allowOfflineAdmin?: boolean;
  primaryAuthMode?: "oauth" | "simple_signin" | "domain_signin";
  smtp?: {
    enabled?: boolean;
    allowInvalidCert?: boolean;
    host: string;
    port: number;
    secure: boolean;
    username?: string;
    password?: string;
    fromEmail?: string;
  };
  offlineReset?: {
    enabled: boolean;
  };
  adminDefaults?: {
    username: string;
    password?: string;
  };
  authModes: AuthModes;
  locales: string[];
  defaultLocale: string;
  theme?: {
    default: ThemeChoice;
    force?: boolean;
  };
};

/**
 * Central configuration loader. Combines JSON defaults with env overrides and
 * exposes a typed AppConfig for the UI and service helpers.
 */
import baseFileConfigJson from "../config/app.config.json";
import devFileConfigJson from "../config/app.config.dev.json";

type FileConfig = Partial<AppConfig> & {
  primaryAuthMode?: string;
  urls?: Partial<Pick<AppConfig, "apiBaseUrl" | "wsPath" | "wsOrigin" | "qrOrigin">>;
  localization?: { locales?: string[]; defaultLocale?: string };
  theme?: { default?: ThemeChoice; force?: boolean };
  adminDefaults?: { username?: string; password?: string };
  offlineReset?: { enabled: boolean };
};

const baseFileConfig: FileConfig = (baseFileConfigJson as unknown as FileConfig) ?? {};
const devFileConfig: FileConfig = (devFileConfigJson as unknown as FileConfig) ?? {};

/**
 * Read a boolean env var ("true"/"1") with a fallback.
 */
const boolEnv = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
};

/**
 * Read a string env var with trimming and fallback.
 */
const strEnv = (key: string, fallback: string): string => {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return fallback;
  return raw.trim();
};

/**
 * Validate an http(s) URL when provided; allow relative paths unchanged.
 */
function validateUrlish(value: string, label: string): string {
  try {
    if (!value.startsWith("http")) return value;
    new URL(value);
    return value;
  } catch {
    throw new Error(`[config] Invalid ${label}: ${value}`);
  }
}

/**
 * Merge file-based config with env overrides and produce the final typed AppConfig.
 * Env vars always win; dev config overlays base config in non-production.
 */
function buildConfig(): AppConfig {
  const mergedFileConfig: FileConfig = {
    ...baseFileConfig,
    ...(process.env.NODE_ENV !== "production" ? devFileConfig : {})
  };

  const locales =
    Array.isArray(mergedFileConfig.localization?.locales) && mergedFileConfig.localization.locales.length
      ? mergedFileConfig.localization.locales
      : Array.isArray(mergedFileConfig.locales) && mergedFileConfig.locales.length
        ? mergedFileConfig.locales
        : ["en-US", "pt-PT", "es-ES"];

  const apiBaseUrl = validateUrlish(
    strEnv(
      "NEXT_PUBLIC_API_BASE_URL",
      mergedFileConfig.urls?.apiBaseUrl ?? mergedFileConfig.apiBaseUrl ?? "http://localhost:4000/api/v1"
    ),
    "API base URL"
  );
  const wsPath = strEnv("NEXT_PUBLIC_WS_PATH", mergedFileConfig.urls?.wsPath ?? mergedFileConfig.wsPath ?? "/api/v1/ws");
  const wsOrigin = strEnv("NEXT_PUBLIC_WS_ORIGIN", mergedFileConfig.urls?.wsOrigin ?? mergedFileConfig.wsOrigin ?? "");
  const qrOrigin = strEnv(
    "NEXT_PUBLIC_QR_ORIGIN",
    mergedFileConfig.urls?.qrOrigin ?? mergedFileConfig.qrOrigin ?? "/api/v1/qr"
  );
  const envLocale = strEnv(
    "NEXT_PUBLIC_LOCALE_DEFAULT",
    mergedFileConfig.localization?.defaultLocale ?? mergedFileConfig.defaultLocale ?? "en-US"
  );
  const defaultLocale = locales.includes(envLocale) ? envLocale : "en-US";

  const allowOfflineAdmin = boolEnv(
    "NEXT_PUBLIC_ALLOW_OFFLINE_ADMIN",
    mergedFileConfig.allowOfflineAdmin ?? process.env.NODE_ENV !== "production"
  );

  const authModes: AuthModes = {
    oauth: boolEnv("NEXT_PUBLIC_AUTH_OAUTH", mergedFileConfig.authModes?.oauth ?? true),
    simpleSignin: boolEnv("NEXT_PUBLIC_AUTH_SIMPLE_SIGNIN", mergedFileConfig.authModes?.simpleSignin ?? true),
    domainSignin: boolEnv("NEXT_PUBLIC_AUTH_DOMAIN_SIGNIN", mergedFileConfig.authModes?.domainSignin ?? false)
  };

  const primaryAuthModeEnv = strEnv("NEXT_PUBLIC_AUTH_PRIMARY", mergedFileConfig.primaryAuthMode ?? "");
  const primaryAuthMode = ["oauth", "simple_signin", "domain_signin"].includes(primaryAuthModeEnv)
    ? (primaryAuthModeEnv as AppConfig["primaryAuthMode"])
    : undefined;

  const smtpEnabled = boolEnv("NEXT_PUBLIC_SMTP_ENABLED", mergedFileConfig.smtp?.enabled ?? true);
  const smtpAllowInvalidCert = boolEnv(
    "NEXT_PUBLIC_SMTP_ALLOW_INVALID_CERT",
    mergedFileConfig.smtp?.allowInvalidCert ?? false
  );
  const smtp = mergedFileConfig.smtp
    ? {
        ...mergedFileConfig.smtp,
        enabled: smtpEnabled,
        allowInvalidCert: smtpAllowInvalidCert
      }
    : undefined;

  const adminDefaults = mergedFileConfig.adminDefaults?.username
    ? {
        username: mergedFileConfig.adminDefaults.username,
        password: mergedFileConfig.adminDefaults.password
      }
    : undefined;

  const offlineReset = mergedFileConfig.offlineReset
    ? {
        enabled: mergedFileConfig.offlineReset.enabled
      }
    : undefined;

  const theme: AppConfig["theme"] = {
    default: mergedFileConfig.theme?.default ?? "system",
    force: mergedFileConfig.theme?.force ?? false
  };

  return {
    apiBaseUrl,
    wsPath,
    wsOrigin: wsOrigin || undefined,
    qrOrigin: qrOrigin || undefined,
    allowOfflineAdmin,
    primaryAuthMode,
    smtp,
    offlineReset,
    adminDefaults,
    authModes,
    locales,
    defaultLocale,
    theme
  };
}

/**
 * Build the websocket URL by combining the configured origin with the WS path.
 */
export const appConfig = buildConfig();

/**
 * Compose the full websocket URL, preferring explicit origin and falling back to browser location.
 */
export function wsUrl(): string {
  const origin =
    appConfig.wsOrigin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return origin.replace(/^http/, "ws") + appConfig.wsPath;
}
