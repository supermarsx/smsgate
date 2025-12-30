"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../components/session-provider";
import { appConfig, wsUrl } from "../lib/config";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  getInitialLocale,
  getTranslations,
  setPreferredLocale,
  type Locale
} from "../lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const { session } = useSession();
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const translations = useMemo(() => getTranslations(locale), [locale]);

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  useEffect(() => {
    if (session) router.replace("/dashboard");
    else router.replace("/login");
  }, [session, router]);

  const t = (key: string): string => translations[key] ?? key;

  function handleLocaleChange(next: Locale) {
    setLocale(next);
    setPreferredLocale(next);
  }

  return (
    <main className="gg-panel">
      <header className="gg-panel__header">
        <div className="gg-pill">Migration WIP</div>
        <h1 className="gg-title">{t("heroTitle")}</h1>
        <p className="gg-subtitle">{t("heroSubtitle")}</p>
      </header>

      <section className="gg-section">
        <h2 className="gg-section__title">{t("nextSteps")}</h2>
        <ul className="gg-list">
          <li>{t("wireConfig")}</li>
          <li>{t("authScreen")}</li>
          <li>{t("wsClient")}</li>
          <li>{t("shell")}</li>
        </ul>
      </section>

      <section className="gg-section gg-config">
        <h2 className="gg-section__title">{t("configCardTitle")}</h2>
        <div className="gg-config__grid">
          <div>
            <div className="gg-label">{t("apiBase")}</div>
            <div className="gg-value">{appConfig.apiBaseUrl}</div>
          </div>
          <div>
            <div className="gg-label">{t("wsEndpoint")}</div>
            <div className="gg-value">{wsUrl()}</div>
          </div>
          <div>
            <div className="gg-label">{t("authModes")}</div>
            <div className="gg-value">
              {Object.entries(appConfig.authModes)
                .filter(([, enabled]) => enabled)
                .map(([key]) => key)
                .join(", ") || "none"}
            </div>
          </div>
          <div>
            <div className="gg-label">{t("localeLabel")}</div>
            <select className="gg-select" value={locale} onChange={(e) => handleLocaleChange(e.target.value as Locale)}>
              {SUPPORTED_LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </main>
  );
}
