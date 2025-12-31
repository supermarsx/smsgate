import enUS from "../locales/en-US.json";
import esES from "../locales/es-ES.json";
import ptPT from "../locales/pt-PT.json";
import { appConfig } from "./config";

const DICTIONARIES = {
  "en-US": enUS,
  "es-ES": esES,
  "pt-PT": ptPT
} as const;

export type Locale = keyof typeof DICTIONARIES;
export const SUPPORTED_LOCALES = Object.keys(DICTIONARIES) as Locale[];

const STORAGE_KEY = "smsgate2_locale_v1";

function tryMatchLocale(value?: string | null): Locale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((loc) => loc.toLowerCase() === normalized);
  if (exact) return exact as Locale;
  const prefix = SUPPORTED_LOCALES.find((loc) => loc.split("-")[0].toLowerCase() === normalized.split("-")[0]);
  return prefix ? (prefix as Locale) : null;
}

const CONFIG_DEFAULT_LOCALE = tryMatchLocale(appConfig.defaultLocale);
const DEFAULT_LOCALE: Locale = CONFIG_DEFAULT_LOCALE ?? "en-US";

export function normalizeLocale(value?: string | null): Locale {
  return tryMatchLocale(value) ?? DEFAULT_LOCALE;
}

export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const cand of candidates) {
    const match = tryMatchLocale(cand);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

export function loadPreferredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string;
    const matched = tryMatchLocale(parsed);
    return matched ?? null;
  } catch {
    return null;
  }
}

export function setPreferredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locale));
  } catch {
    // ignore storage write errors
  }
}

export function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  return loadPreferredLocale() ?? detectBrowserLocale();
}

export function getTranslations(locale?: Locale): Record<string, string> {
  const resolved = normalizeLocale(locale);
  return DICTIONARIES[resolved];
}

export function listDictionaries(): Record<Locale, Record<string, string>> {
  return { ...DICTIONARIES };
}
