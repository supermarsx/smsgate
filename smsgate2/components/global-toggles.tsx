"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "./theme";
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  getInitialLocale,
  getTranslations,
  setPreferredLocale,
  type Locale
} from "../lib/i18n";

const LOCALE_LABELS: Record<string, string> = {
  "en-US": "English",
  "pt-PT": "Português",
  "es-ES": "Español"
};

export function GlobalToggles() {
  const { theme, toggle } = useTheme();
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  function changeLocale(next: Locale) {
    setPreferredLocale(next);
    setLocale(next);
  }

  return (
    <div className="fab-bar global">
      <div className="fab" title={t("themeToggle", "Toggle theme")} onClick={toggle}>
        <span className="emoji-tint">{theme === "dark" ? "🌙" : "☀️"}</span>
      </div>
      <div className={`fab locale ${menuOpen ? "open" : ""}`}>
        <button
          type="button"
          className="fab-trigger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t("localeSelect", "Change language")}
        >
          <span className="emoji-tint">🌐</span>
        </button>
        {menuOpen && (
          <div className="fab-menu">
            {SUPPORTED_LOCALES.map((loc) => (
              <button
                key={loc}
                className={`fab-option ${locale === loc ? "active" : ""}`}
                onClick={() => {
                  changeLocale(loc as Locale);
                  setMenuOpen(false);
                }}
                type="button"
              >
                {LOCALE_LABELS[loc] ?? loc}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
