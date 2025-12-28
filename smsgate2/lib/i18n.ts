const STORAGE_KEY = "smsgate2_locale";

export type Locale = "en-US" | "pt-PT" | "es-ES";

export const SUPPORTED_LOCALES: Locale[] = ["en-US", "pt-PT", "es-ES"];
export const DEFAULT_LOCALE: Locale = "en-US";

type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = {
  "en-US": {
    heroTitle: "smsgate2 dashboard scaffold",
    heroSubtitle: "Next.js 14 app directory + Bun + Bulma. Wire syncserver REST/WS and Graphite Glass UI next.",
    nextSteps: "Next steps",
    wireConfig: "Wire config/env loader (API base, WS path, auth modes, locale).",
    authScreen: "Add auth entry (oauth / simple_signin / domain_signin toggles).",
    wsClient: "Build WS client for WELCOME/SNAPSHOT/EVENT_NEW/PRESENCE_UPDATE.",
    shell: "Lay out dashboard shell: left nav, status bar, phone mock feed.",
    configCardTitle: "Loaded config",
    localeLabel: "Locale",
    authModes: "Auth modes",
    apiBase: "API base",
    wsEndpoint: "WS endpoint"
  },
  "pt-PT": {
    heroTitle: "smsgate2 esqueleto do dashboard",
    heroSubtitle: "Next.js 14 (app dir) + Bun + Bulma. Ligar REST/WS do syncserver e UI Graphite Glass a seguir.",
    nextSteps: "Próximos passos",
    wireConfig: "Ligar carregador de config/env (API base, caminho WS, modos de auth, locale).",
    authScreen: "Adicionar ecrã de autenticação (oauth / simple_signin / domain_signin).",
    wsClient: "Criar cliente WS para WELCOME/SNAPSHOT/EVENT_NEW/PRESENCE_UPDATE.",
    shell: "Montar layout: nav esquerda, barra de estado, feed em mock de telefone.",
    configCardTitle: "Config carregada",
    localeLabel: "Idioma",
    authModes: "Modos de auth",
    apiBase: "Base da API",
    wsEndpoint: "Endpoint WS"
  },
  "es-ES": {
    heroTitle: "smsgate2 andamiaje del panel",
    heroSubtitle: "Next.js 14 (app dir) + Bun + Bulma. Conecta REST/WS de syncserver y UI Graphite Glass después.",
    nextSteps: "Próximos pasos",
    wireConfig: "Conectar cargador de config/env (API base, ruta WS, modos de auth, locale).",
    authScreen: "Añadir pantalla de login (oauth / simple_signin / domain_signin).",
    wsClient: "Construir cliente WS para WELCOME/SNAPSHOT/EVENT_NEW/PRESENCE_UPDATE.",
    shell: "Maquetar el shell: nav izquierda, barra de estado, feed en mock de teléfono.",
    configCardTitle: "Config cargada",
    localeLabel: "Idioma",
    authModes: "Modos de auth",
    apiBase: "Base API",
    wsEndpoint: "Endpoint WS"
  }
};

export function normalizeLocale(input?: string | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const exact = SUPPORTED_LOCALES.find((loc) => loc.toLowerCase() === input.toLowerCase());
  if (exact) return exact;
  const base = input.split("-")[0];
  const fallback = SUPPORTED_LOCALES.find((loc) => loc.toLowerCase().startsWith(base.toLowerCase()));
  return fallback ?? DEFAULT_LOCALE;
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const langs = navigator.languages ?? [navigator.language];
  for (const lang of langs) {
    const normalized = normalizeLocale(lang);
    if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
  }
  return DEFAULT_LOCALE;
}

export function loadPreferredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored ? normalizeLocale(stored) : DEFAULT_LOCALE;
}

export function setPreferredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const stored = loadPreferredLocale();
  if (stored) return stored;
  return detectBrowserLocale();
}

export function getTranslations(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
}
