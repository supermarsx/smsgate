import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  getInitialLocale,
  getTranslations,
  loadPreferredLocale,
  normalizeLocale,
  setPreferredLocale
} from "../lib/i18n";

const STORAGE_KEY = "smsgate2_locale_v1";

describe("i18n behavior", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("normalizes locale by exact, case-insensitive, and prefix match", () => {
    expect(normalizeLocale("en-US")).toBe("en-US");
    expect(normalizeLocale("es-es")).toBe("es-ES");
    expect(normalizeLocale("pt-BR")).toBe("pt-PT");
    expect(normalizeLocale("fr-FR")).toBe(DEFAULT_LOCALE);
  });

  it("detects browser locale from navigator.languages preference", () => {
    vi.stubGlobal("navigator", { languages: ["es-MX", "en-US"], language: "en-US" } as unknown as Navigator);
    expect(detectBrowserLocale()).toBe("es-ES");
  });

  it("falls back to default when browser locales are unsupported", () => {
    vi.stubGlobal("navigator", { languages: ["fr-FR"], language: "fr-FR" } as unknown as Navigator);
    expect(detectBrowserLocale()).toBe(DEFAULT_LOCALE);
  });

  it("loads preferred locale from storage when present", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify("pt-PT"));
    expect(loadPreferredLocale()).toBe("pt-PT");
  });

  it("returns null when stored locale is invalid or unsupported", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(loadPreferredLocale()).toBeNull();
    localStorage.setItem(STORAGE_KEY, JSON.stringify("fr-FR"));
    expect(loadPreferredLocale()).toBeNull();
  });

  it("persists preferred locale and dispatches change event", () => {
    const seen: unknown[] = [];
    const handler = (event: Event) => {
      if (event instanceof CustomEvent) seen.push(event.detail);
    };
    window.addEventListener("smsgate2:locale-changed", handler);
    setPreferredLocale("es-ES");
    window.removeEventListener("smsgate2:locale-changed", handler);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toBe("es-ES");
    expect(seen).toEqual(["es-ES"]);
  });

  it("prefers stored locale over browser detection for initial resolve", () => {
    setPreferredLocale("pt-PT");
    vi.stubGlobal("navigator", { languages: ["es-MX"], language: "es-MX" } as unknown as Navigator);
    expect(getInitialLocale()).toBe("pt-PT");
  });

  it("uses browser locale when storage is empty", () => {
    vi.stubGlobal("navigator", { languages: ["es-AR"], language: "es-AR" } as unknown as Navigator);
    expect(getInitialLocale()).toBe("es-ES");
  });

  it("falls back to default dictionary when locale is unknown", () => {
    const defaultDict = getTranslations(DEFAULT_LOCALE);
    expect(getTranslations("fr-FR" as any)).toEqual(defaultDict);
  });
});
