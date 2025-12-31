/**
 * @fileoverview Locale helpers for dictionary resolution and persistence.
 */

import { useEffect, useState } from "react";
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

/**
 * Attempt to match a locale to the supported list by exact or language prefix.
 * @returns Matched locale or null when not found.
 */
function tryMatchLocale(value?: string | null): Locale | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((loc) => loc.toLowerCase() === normalized);
  if (exact) return exact as Locale;
  const prefix = SUPPORTED_LOCALES.find((loc) => loc.split("-")[0].toLowerCase() === normalized.split("-")[0]);
  return prefix ? (prefix as Locale) : null;
}

const CONFIG_DEFAULT_LOCALE = tryMatchLocale(appConfig.defaultLocale);
export const DEFAULT_LOCALE: Locale = CONFIG_DEFAULT_LOCALE ?? "en-US";

/**
 * Resolve locale in a hydration-safe way and react to changes (storage/custom events).
 */
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    // Initial sync after mount
    setLocale(getInitialLocale());

    // Listen for explicit locale changes dispatched by setPreferredLocale
    const onLocaleEvent = (event: Event) => {
      if (event instanceof CustomEvent && event.detail) {
        setLocale(normalizeLocale(String(event.detail)));
      }
    };

    // React to storage updates (e.g., other tabs/windows)
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      try {
        setLocale(normalizeLocale(event.newValue ? (JSON.parse(event.newValue) as string) : undefined));
      } catch {
        // ignore malformed storage values
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("smsgate2:locale-changed", onLocaleEvent as EventListener);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("smsgate2:locale-changed", onLocaleEvent as EventListener);
    };
  }, []);

  return locale;
}

/**
 * Normalize a locale value to the closest supported locale.
 * @returns Supported locale selection.
 */
export function normalizeLocale(value?: string | null): Locale {
  return tryMatchLocale(value) ?? DEFAULT_LOCALE;
}

/**
 * Detect a browser locale from navigator hints.
 * @returns Best-match locale from browser hints.
 */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const cand of candidates) {
    const match = tryMatchLocale(cand);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

/**
 * Load a persisted locale preference from storage.
 * @returns Locale preference or null when unavailable.
 */
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

/**
 * Persist a locale preference to storage.
 * @returns void
 */
export function setPreferredLocale(locale: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locale));
    const event = new CustomEvent("smsgate2:locale-changed", { detail: locale });
    window.dispatchEvent(event);
  } catch {
    // ignore storage write errors
  }
}

/**
 * Resolve initial locale from storage or browser fallback.
 * @returns Initial locale for the UI.
 */
export function getInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  return loadPreferredLocale() ?? detectBrowserLocale();
}

/**
 * Retrieve translations for a locale.
 * @returns Translation dictionary.
 */
export function getTranslations(locale?: Locale): Record<string, string> {
  const resolved = normalizeLocale(locale);
  return DICTIONARIES[resolved];
}

/**
 * Return a shallow copy of all dictionaries.
 * @returns Map of locale to translation dictionary.
 */
export function listDictionaries(): Record<Locale, Record<string, string>> {
  return { ...DICTIONARIES };
}
