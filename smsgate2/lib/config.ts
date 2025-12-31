type ThemeChoice = "light" | "dark" | "system";

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

import baseFileConfigJson from "../config/app.config.json";
import devFileConfigJson from "../config/app.config.dev.json";

type FileConfig = Partial<AppConfig> & {
  primaryAuthMode?: string;
  urls?: Partial<Pick<AppConfig, "apiBaseUrl" | "wsPath" | "wsOrigin" | "qrOrigin">>;
  localization?: { locales?: string[]; defaultLocale?: string };
  theme?: { default?: ThemeChoice; force?: boolean };
  adminDefaults?: { username?: string; password?: string };
  offlineReset?: { enabled: boolean; defaultAdminUsername?: string; defaultAdminPassword?: string };
};

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
    : mergedFileConfig.offlineReset?.defaultAdminUsername
      ? {
          username: mergedFileConfig.offlineReset.defaultAdminUsername,
          password: mergedFileConfig.offlineReset.defaultAdminPassword
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

export const appConfig = buildConfig();

export function wsUrl(): string {
  const origin =
    appConfig.wsOrigin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return origin.replace(/^http/, "ws") + appConfig.wsPath;
}
  const defaultLocale = locales.includes(envLocale) ? envLocale : "en-US";
  const allowOfflineAdmin = boolEnv(
    "NEXT_PUBLIC_ALLOW_OFFLINE_ADMIN",
    mergedFileConfig.allowOfflineAdmin ?? process.env.NODE_ENV !== "production"
  );

  const authModes: AuthModes = {
    oauth: boolEnv("NEXT_PUBLIC_AUTH_OAUTH", mergedFileConfig.authModes?.oauth ?? true),
    simpleSignin: boolEnv("NEXT_PUBLIC_AUTH_SIMPLE_SIGNIN", mergedFileConfig.authModes?.simpleSignin ?? true),
    domainSignin: boolEnv("NEXT_PUBLIC_AUTH_DOMAIN_SIGNIN", mergedFileConfig.authModes?.domainSignin ?? false)
      adminDefaults,
  };
  const primaryAuthModeEnv = strEnv("NEXT_PUBLIC_AUTH_PRIMARY", mergedFileConfig.primaryAuthMode ?? "");
      defaultLocale,
      theme
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

  return {
    apiBaseUrl,
    wsPath,
    wsOrigin: wsOrigin || undefined,
    qrOrigin: qrOrigin || undefined,
    allowOfflineAdmin,
    primaryAuthMode,
    smtp,
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
