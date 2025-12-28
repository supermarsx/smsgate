"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { LoginPanel } from "../../components/login-panel";
import { exchangeOAuthCode, loadSession, saveSession, type Session } from "../../lib/auth";
import { useSession } from "../../components/session-provider";
import { getTranslations, getInitialLocale, DEFAULT_LOCALE } from "../../lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { session, setSession } = useSession();
  const locale = getInitialLocale();
  const t = (key: string) => getTranslations(locale)[key] ?? key;

  useEffect(() => {
    const existing = session ?? loadSession();
    if (existing) {
      setSession(existing);
      router.replace("/dashboard");
    }
  }, [session, setSession, router]);

  useEffect(() => {
    const code = search?.get("code");
    const error = search?.get("error");
    if (!code && !error) return;
    if (error) return;
    const redirectUri = window.location.origin + "/login/oauth/callback";
    exchangeOAuthCode(code as string, redirectUri)
      .then((s) => {
        if (s) {
          setSession(s);
          saveSession(s, true);
          router.replace("/dashboard");
        }
      })
      .catch(() => undefined);
  }, [search, setSession, router]);

  function handleLogin(s: Session) {
    setSession(s);
    saveSession(s, true);
    router.replace("/dashboard");
  }

  return (
    <main className="gg-panel">
      <header className="gg-panel__header">
        <div className="gg-pill">Auth</div>
        <h1 className="gg-title">{t("heroTitle")}</h1>
        <p className="gg-subtitle">{t("heroSubtitle")}</p>
      </header>
      <section className="gg-section">
        <LoginPanel onLogin={handleLogin} />
      </section>
    </main>
  );
}
