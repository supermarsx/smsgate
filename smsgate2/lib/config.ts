/**
 * @fileoverview Runtime configuration loader for smsgate2 UI.
 */

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

type UiDefaults = {
  pageSize?: number;
  dateFormat?: string;
  showDebug?: boolean;
};

type RouteLimits = {
  dashboard?: boolean;
  devices?: boolean;
  numbers?: boolean;
  users?: boolean;
  audit?: boolean;
  logins?: boolean;
  contacts?: boolean;
  config?: boolean;
};

type NumberActionLimits = {
  create?: boolean;
  assign?: boolean;
  update?: boolean;
  delete?: boolean;
};

type DeviceActionLimits = {
  pair?: boolean;
  rename?: boolean;
  toggle?: boolean;
};

type UserActionLimits = {
  editRoles?: boolean;
  forceLogout?: boolean;
};

type ContactsActionLimits = {
  sync?: boolean;
  export?: boolean;
};

type AuditActionLimits = {
  export?: boolean;
};

type ActionLimits = {
  numbers?: NumberActionLimits;
  devices?: DeviceActionLimits;
  users?: UserActionLimits;
  contacts?: ContactsActionLimits;
  audit?: AuditActionLimits;
};

type RealtimeLimits = {
  enabled?: boolean;
  statusBar?: boolean;
};

type DebugLimits = {
  ui?: boolean;
  logs?: boolean;
};

type Limits = {
  routes?: RouteLimits;
  actions?: ActionLimits;
  realtime?: RealtimeLimits;
  debug?: DebugLimits;
};

type FeatureFlags = Record<string, boolean>;

type RealtimeConfig = {
  pingMs?: number;
  reconnectCapMs?: number;
};

type ContactsConfig = {
  syncIntervalMinutes?: number;
  conflictStrategy?: "remote" | "local" | "prompt";
};

type LoggingConfig = {
  level?: "debug" | "info" | "warn" | "error";
  console?: boolean;
};

type TelemetryConfig = {
  enabled?: boolean;
  endpoint?: string;
  sampleRate?: number;
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
    replyTo?: string;
    rateLimitPerHour?: number;
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
  ui?: UiDefaults;
  featureFlags?: FeatureFlags;
  realtime?: RealtimeConfig;
  contacts?: ContactsConfig;
  logging?: LoggingConfig;
  telemetry?: TelemetryConfig;
  limits?: Limits;
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
  limits?: Limits;
};

const baseFileConfig: FileConfig = (baseFileConfigJson as unknown as FileConfig) ?? {};
const devFileConfig: FileConfig = (devFileConfigJson as unknown as FileConfig) ?? {};

/**
 * Read a boolean env var ("true"/"1") with a fallback.
 * @param key Environment variable name.
 * @param fallback Value to use when env is absent.
 * @returns Boolean value for the env var or fallback.
 */
const boolEnv = (key: string, fallback: boolean): boolean => {
  const raw = process.env[key];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
};

/**
 * Read a string env var with trimming and fallback.
 * @param key Environment variable name.
 * @param fallback Value to use when env is absent.
 * @returns Trimmed string value or fallback.
 */
const strEnv = (key: string, fallback: string): string => {
  const raw = process.env[key];
  if (!raw || !raw.trim()) return fallback;
  return raw.trim();
};

/**
 * Validate an http(s) URL when provided; allow relative paths unchanged.
 * @param value Value to validate.
 * @param label Error label for reporting.
 * @returns Original value when valid.
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
 * @returns Final resolved application config.
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
  const wsPath = strEnv(
    "NEXT_PUBLIC_WS_PATH",
    mergedFileConfig.urls?.wsPath ?? mergedFileConfig.wsPath ?? "/api/v1/ws"
  );
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

  const ui: AppConfig["ui"] = {
    pageSize: mergedFileConfig.ui?.pageSize ?? 20,
    dateFormat: mergedFileConfig.ui?.dateFormat ?? "YYYY-MM-DD",
    showDebug: mergedFileConfig.ui?.showDebug ?? false
  };

  const realtime: AppConfig["realtime"] = {
    pingMs: mergedFileConfig.realtime?.pingMs ?? 15_000,
    reconnectCapMs: mergedFileConfig.realtime?.reconnectCapMs ?? 30_000
  };

  const contacts: AppConfig["contacts"] = {
    syncIntervalMinutes: mergedFileConfig.contacts?.syncIntervalMinutes ?? 30,
    conflictStrategy: mergedFileConfig.contacts?.conflictStrategy ?? "prompt"
  };

  const logging: AppConfig["logging"] = {
    level: mergedFileConfig.logging?.level ?? "info",
    console: mergedFileConfig.logging?.console ?? true
  };

  const telemetry: AppConfig["telemetry"] = {
    enabled: mergedFileConfig.telemetry?.enabled ?? false,
    endpoint: mergedFileConfig.telemetry?.endpoint,
    sampleRate: mergedFileConfig.telemetry?.sampleRate ?? 1
  };

  const featureFlags = mergedFileConfig.featureFlags ?? {};

  const limits: Limits = {
    routes: {
      dashboard: mergedFileConfig.limits?.routes?.dashboard ?? true,
      devices: mergedFileConfig.limits?.routes?.devices ?? false,
      numbers: mergedFileConfig.limits?.routes?.numbers ?? false,
      users: mergedFileConfig.limits?.routes?.users ?? true,
      audit: mergedFileConfig.limits?.routes?.audit ?? false,
      logins: mergedFileConfig.limits?.routes?.logins ?? false,
      contacts: mergedFileConfig.limits?.routes?.contacts ?? false,
      config: mergedFileConfig.limits?.routes?.config ?? false
    },
    actions: {
      numbers: {
        create: mergedFileConfig.limits?.actions?.numbers?.create ?? false,
        assign: mergedFileConfig.limits?.actions?.numbers?.assign ?? false,
        update: mergedFileConfig.limits?.actions?.numbers?.update ?? false,
        delete: mergedFileConfig.limits?.actions?.numbers?.delete ?? false
      },
      devices: {
        pair: mergedFileConfig.limits?.actions?.devices?.pair ?? false,
        rename: mergedFileConfig.limits?.actions?.devices?.rename ?? false,
        toggle: mergedFileConfig.limits?.actions?.devices?.toggle ?? false
      },
      users: {
        editRoles: mergedFileConfig.limits?.actions?.users?.editRoles ?? false,
        forceLogout: mergedFileConfig.limits?.actions?.users?.forceLogout ?? false
      },
      contacts: {
        sync: mergedFileConfig.limits?.actions?.contacts?.sync ?? false,
        export: mergedFileConfig.limits?.actions?.contacts?.export ?? false
      },
      audit: {
        export: mergedFileConfig.limits?.actions?.audit?.export ?? false
      }
    },
    realtime: {
      enabled: mergedFileConfig.limits?.realtime?.enabled ?? true,
      statusBar: mergedFileConfig.limits?.realtime?.statusBar ?? true
    },
    debug: {
      ui: mergedFileConfig.limits?.debug?.ui ?? false,
      logs: mergedFileConfig.limits?.debug?.logs ?? false
    }
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
    theme,
    ui,
    featureFlags,
    realtime,
    contacts,
    logging,
    telemetry,
    limits
  };
}

/**
 * Build the websocket URL by combining the configured origin with the WS path.
 */
export const appConfig = buildConfig();

/**
 * Compose the full websocket URL, preferring explicit origin and falling back to browser location.
 * @returns Fully-qualified websocket URL.
 */
export function wsUrl(): string {
  const origin =
    appConfig.wsOrigin ?? (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return origin.replace(/^http/, "ws") + appConfig.wsPath;
}
