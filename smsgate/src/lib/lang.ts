import { clientConfig } from "./config";

export type Translations = Record<string, string>;

const supportedLocales = ["en_US", "pt_PT", "es_ES"];

function normalizeLocale(locale: string): string {
  return locale.replace("-", "_");
}

function detectLocale(): string {
  if (clientConfig.language !== "auto") {
    return clientConfig.language;
  }
  if (typeof navigator === "undefined") {
    return "en_US";
  }
  const candidates = [navigator.language, ...(navigator.languages ?? [])]
    .filter(Boolean)
    .map((lang) => normalizeLocale(lang));
  for (const candidate of candidates) {
    if (supportedLocales.includes(candidate)) return candidate;
    const short = candidate.split("_")[0];
    const match = supportedLocales.find((locale) => locale.startsWith(short));
    if (match) return match;
  }
  return "en_US";
}

export async function loadTranslations(): Promise<Translations> {
  const locale = detectLocale();
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale.replace("_", "-");
  }
  const res = await fetch(`/lang/${locale}.json`);
  if (!res.ok) {
    return {};
  }
  return res.json();
}
