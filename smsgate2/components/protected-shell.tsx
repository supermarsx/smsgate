"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { logout } from "../lib/auth";
import { allowedNav, getRoleLabel } from "../lib/roles";
import { useSession } from "./session-provider";
import { useStatus } from "./status-context";
import { useTheme } from "./theme";
import { SUPPORTED_LOCALES, getInitialLocale, getTranslations, setPreferredLocale, type Locale } from "../lib/i18n";
import { useConfig } from "./config-provider";

type Props = {
  children: React.ReactNode;
};

export function ProtectedShell({ children }: Props) {
  const { session, setSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const status = useStatus();
  const { theme, toggle } = useTheme();
  const { config } = useConfig();
  const [locale, setLocale] = useState<Locale>("en-US");
  const [localeMenuOpen, setLocaleMenuOpen] = useState(false);
  const [showMoreStatus, setShowMoreStatus] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (!session && typeof window !== "undefined") {
      router.replace("/login");
    }
  }, [router, session]);

  const rolesConfig = useMemo(() => ((config?.data as any)?.roles ?? {}) as any, [config]);
  const roleOrder = rolesConfig?.order;
  const roleLabels = rolesConfig?.labels ?? {};

  const translations = useMemo(() => getTranslations(locale), [locale]);
  const t = useMemo(() => (key: string, fallback: string) => translations[key] ?? fallback, [translations]);

  const navItems = useMemo(() => (session ? allowedNav(session.user.role, roleOrder) : []), [roleOrder, session]);
  useEffect(() => {
    if (!session) return;
    const allowedPaths = navItems.map((n) => n.path);
    if (!allowedPaths.includes(pathname)) {
      setUnauthorized(true);
      router.replace(allowedPaths[0] ?? "/dashboard");
    } else {
      setUnauthorized(false);
    }
  }, [navItems, pathname, router, session]);

  async function handleLogout() {
    await logout();
    setSession(null);
    router.replace("/login");
  }

  useEffect(() => {
    setLocale(getInitialLocale());
  }, []);

  function changeLocale(next: Locale) {
    setLocale(next);
    setPreferredLocale(next);
  }

  if (!session) return null;
  if (unauthorized) {
    return (
      <div className="gg-panel">
        <div className="login-error">{t("unauthorized", "Unauthorized for this route; redirecting...")}</div>
      </div>
    );
  }

  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="shell-nav">
        <div className="nav-brand-row">
          <div className="nav-brand small">{t("brandName", "smsgate2")}</div>
          <button className="ghost nav-toggle" onClick={() => setNavOpen((v) => !v)}>
            {navOpen ? t("navClose", "Close") : t("navMenu", "Menu")}
          </button>
        </div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`nav-link ${pathname === item.path ? "is-active" : ""}`}
              onClick={() => setNavOpen(false)}
            >
              {t(`nav${item.label}`, item.label)}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="shell-main">
        <header className="shell-topbar">
          <div className="topbar-meta">
            <span className="pill pill-muted">{getRoleLabel(session.user.role, roleLabels)}</span>
            <div className="account-chip">
              <div className="gg-label">{t("account", "Account")}</div>
              <div className="gg-value">{session.user.email ?? session.user.name}</div>
              {session.user.email && <div className="muted small">{session.user.name}</div>}
            </div>
            <span className={`badge ${session.user.requires2fa ? "degraded" : "online"}`}>
              {session.user.requires2fa ? t("twoFaRequired", "2FA required") : t("twoFaReady", "2FA ready")}
            </span>
          </div>
          <div className="topbar-actions">
            <button className="ghost" onClick={() => setDebugOpen((v) => !v)}>
              {t("debugLabel", "Debug")}
            </button>
            <button className="ghost" onClick={handleLogout}>
              {t("logout", "Logout")}
            </button>
          </div>
        </header>
        {!status.connected && (
          <div className="banner warn">
            {t("reconnectingBanner", "Reconnecting to realtime stream... showing cached data.")}{" "}
            {status.lastError ? `(${status.lastError})` : ""}
          </div>
        )}
        {session.user.requiresPasswordChange && (
          <div className="banner warn">
            {t("passwordChangeRequired", "Password change required before accessing the console.")}
          </div>
        )}
        {session.user.requires2fa && (
          <div className="banner warn">
            {t("mfaRequired", "2FA enrollment required; sign in with MFA to continue.")}
          </div>
        )}
        {debugOpen && (
          <div className="debug-overlay">
            <div className="gg-label">{t("debugSnapshot", "Debug snapshot")}</div>
            <pre className="pairing-pre">{JSON.stringify(status, null, 2)}</pre>
            <div className="actions">
              <button className="ghost" onClick={() => setShowLogs((v) => !v)}>
                {showLogs ? t("hideLogs", "Hide logs") : t("showLogs", "Show logs")}
              </button>
            </div>
            {showLogs && status.logs && (
              <div className="log-grid">
                {status.logs.map((log, idx) => (
                  <div key={idx} className="log-row">
                    <span className="muted">{new Date(log.ts).toLocaleTimeString()}</span>
                    <span>{log.type}</span>
                    {log.detail && <span className="muted">{log.detail}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="shell-content">
          {session.user.requiresPasswordChange || session.user.requires2fa ? (
            <div className="gg-panel">
              <div className="login-error">
                {t(
                  "accessBlocked",
                  "Account requires password update and/or 2FA enrollment. Please log out and complete the required step."
                )}
              </div>
            </div>
          ) : (
            children
          )}
        </div>
        <div className="status-float">
          <div
            className="status-pill-mini"
            data-tip={`${t("wsLabel", "WS")}: ${status.connected ? t("onlineLabel", "Online") : t("offlineLabel", "Offline")} · ${status.clientRtt ?? "-"}`}
          >
            <span className={`dot ${status.connected ? "ok" : "warn"}`} />
            <span>{t("wsLabel", "WS")}</span>
          </div>
          <div
            className="status-pill-mini"
            data-tip={`${t("devicesLabel", "Devices")}: ${status.devicesOnline ?? 0} · ${status.deviceRtt ?? "-"}`}
          >
            <span className="dot info" />
            <span>{status.devicesOnline ?? 0}</span>
          </div>
          <div
            className="status-pill-mini"
            data-tip={`${t("latencyLabel", "Latency")}: ${status.ingestLatency ?? "-"} · ${t("reconnects", "Reconnects")}: ${status.reconnects ?? 0}`}
          >
            <span className="dot ok" />
            <span>{status.ingestLatency ?? "-"}</span>
          </div>
          <button
            type="button"
            className="status-pill-mini status-more-btn"
            onClick={() => setShowMoreStatus((v) => !v)}
            aria-expanded={showMoreStatus}
            title={t("showMore", "Show more")}
          >
            <span className="dot" />
            <span>{showMoreStatus ? "-" : "+"}</span>
          </button>
        </div>
        {showMoreStatus && (
          <div className="status-more-panel">
            <div className="status-row">
              <span className="muted">{t("rttLabel", "RTT")}</span>
              <span>{status.clientRtt ?? "-"}</span>
            </div>
            <div className="status-row">
              <span className="muted">{t("deviceRtt", "Device RTT")}</span>
              <span>{status.deviceRtt ?? "-"}</span>
            </div>
            <div className="status-row">
              <span className="muted">{t("errorsLabel", "Errors")}</span>
              <span>{status.wsErrors ?? 0}</span>
            </div>
            <div className="status-row">
              <span className="muted">{t("reconnects", "Reconnects")}</span>
              <span>{status.reconnects ?? 0}</span>
            </div>
            <div className="status-row">
              <span className="muted">{t("roleLabel", "Role")}</span>
              <span>{session.user.role}</span>
            </div>
          </div>
        )}
        <div className="fab-bar">
          <div className="fab" title={t("themeToggle", "Toggle theme")} onClick={toggle}>
            {theme === "dark" ? "🌙" : "☀️"}
          </div>
          <div className={`fab locale ${localeMenuOpen ? "open" : ""}`}>
            <button
              type="button"
              className="fab-trigger"
              onClick={() => setLocaleMenuOpen((v) => !v)}
              aria-label={t("localeSelect", "Change language")}
            >
              🌐
            </button>
            {localeMenuOpen && (
              <div className="fab-menu">
                {SUPPORTED_LOCALES.map((loc) => (
                  <button
                    key={loc}
                    className={`fab-option ${locale === loc ? "active" : ""}`}
                    onClick={() => {
                      changeLocale(loc as Locale);
                      setLocaleMenuOpen(false);
                    }}
                    type="button"
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="account-float glass">
          <div className="account-row">
            <div>
              <div className="gg-label">{t("account", "Account")}</div>
              <div className="gg-value">{session.user.email ?? session.user.name}</div>
              {session.user.email && <div className="muted small">{session.user.name}</div>}
            </div>
            <button className="ghost" onClick={handleLogout}>
              {t("logout", "Logout")}
            </button>
          </div>
          <div className="muted small">{getRoleLabel(session.user.role, roleLabels)}</div>
        </div>
      </section>
    </div>
  );
}
