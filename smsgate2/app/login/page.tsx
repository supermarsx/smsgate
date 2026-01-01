"use client";

/**
 * @fileoverview Login page with OAuth callback handling and session hydration.
 */

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginPanel } from "../../components/login-panel";
import { exchangeOAuthCode, loadSession, saveSession, type Session } from "../../lib/auth";
import { useSession } from "../../components/session-provider";
import { getTranslations, getInitialLocale, useLocale } from "../../lib/i18n";

/**
 * OAuth callback-aware login page that hydrates sessions and renders login panel.
 * @returns Login body element.
 */
function LoginBody() {
  const router = useRouter();
  const search = useSearchParams();
  const { session, setSession } = useSession();
  const locale = useLocale();
  const t = (key: string, fallback?: string) => getTranslations(locale)[key] ?? fallback ?? key;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = session ?? (await loadSession());
      if (!cancelled && existing) {
        setSession(existing);
        router.replace("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, setSession, router]);

  useEffect(() => {
    const code = search?.get("code");
    const error = search?.get("error");
    if (!code && !error) return;
    if (error) return;
    const redirectUri = window.location.origin + "/login/oauth/callback";
    exchangeOAuthCode(code as string, redirectUri)
      .then(async (s) => {
        if (s) {
          setSession(s);
          await saveSession(s, true);
          router.replace("/dashboard");
        }
      })
      .catch(() => undefined);
  }, [search, setSession, router]);

  async function handleLogin(s: Session) {
    setSession(s);
    await saveSession(s, true);
    router.replace("/dashboard");
  }

  return (
    <main className="gg-panel login-page">
      <header className="gg-panel__header">
        <div className="gg-pill">{t("authLabel", "Auth")}</div>
        <h1 className="gg-title">{t("heroTitle")}</h1>
        <p className="gg-subtitle">{t("heroSubtitle")}</p>
      </header>
      <section className="gg-section">
        <LoginPanel onLogin={handleLogin} />
      </section>
    </main>
  );
}

/**
 * Login page entry with suspense fallback.
 * @returns Login page element.
 */
export default function LoginPage() {
  const fallbackDict = getTranslations(getInitialLocale());
  const fallbackText = fallbackDict.loading ?? "Loading...";
  return (
    <Suspense fallback={<div className="gg-panel">{fallbackText}</div>}>
      <LoginBody />
    </Suspense>
  );
}
