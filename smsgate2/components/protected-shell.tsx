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
          <div className="nav-brand">{t("brandName", "smsgate2")}</div>
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
            <div
              className={`status-chip ${status.connected ? "ok" : "warn"}`}
              title={status.lastError ?? t("wsStatusTitle", "WS status")}
            >
              <span className={`status-dot ${status.connected ? "" : "warn"}`} />
              <div className="chip-label">{t("wsLabel", "WS")}</div>
              <div className="chip-value">
                {status.connected ? t("onlineLabel", "Online") : t("offlineLabel", "Offline")}
              </div>
              <div className="muted small">
                {t("rttLabel", "RTT")} {status.clientRtt ?? "-"}
              </div>
            </div>
            <div className="status-chip info" title={t("presenceLabel", "Device presence and RTT")}>
              <span className="status-dot" />
              <div className="chip-label">{t("devicesLabel", "Devices")}</div>
              <div className="chip-value">
                {status.devicesOnline ?? 0} {t("onlineLabel", "online")}
              </div>
              <div className="muted small">
                {t("rttLabel", "RTT")} {status.deviceRtt ?? "-"}
              </div>
            </div>
            <div className="status-chip ok" title={t("dashboardIngest", "Ingest to render latency")}>
              <span className="status-dot" />
              <div className="chip-label">{t("latencyLabel", "Latency")}</div>
              <div className="chip-value">{status.ingestLatency ?? "-"}</div>
              <div className="muted small">
                {t("errorPrefix", "Error")}: {status.wsErrors ?? 0}
              </div>
            </div>
            <div className="status-chip" title={t("reconnects", "WS reconnects")}>
              <span className="status-dot" />
              <div className="chip-label">{t("reconnects", "Reconnects")}</div>
              <div className="chip-value">{status.reconnects ?? 0}</div>
              <div className="muted small">
                {t("roleLabel", "Role")} {session.user.role}
              </div>
            </div>
            <button className="ghost" onClick={toggle} title={t("themeToggle", "Toggle theme")}>
              {t("themeToggle", "Toggle theme")}: {theme === "dark" ? t("themeDark", "Dark") : t("themeLight", "Light")}
            </button>
            <select
              className="gg-select topbar-select"
              value={locale}
              onChange={(e) => changeLocale(e.target.value as Locale)}
            >
              {SUPPORTED_LOCALES.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
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
      </section>
    </div>
  );
}
