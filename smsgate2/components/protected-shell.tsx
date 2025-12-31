"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { logout } from "../lib/auth";
import { allowedNav, getRoleLabel } from "../lib/roles";
import { useSession } from "./session-provider";
import { useStatus } from "./status-context";
import { useConfig } from "./config-provider";
import { mapWsErrorKey } from "../lib/status";
import { getInitialLocale, getTranslations, type Locale } from "../lib/i18n";
import { StatusBar } from "./status-bar";

type Props = {
  children: React.ReactNode;
};

export function ProtectedShell({ children }: Props) {
  const { session, setSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const status = useStatus();
  const { config } = useConfig();
  const [navOpen, setNavOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [locale] = useState<Locale>(getInitialLocale());
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
  const navLabels = useMemo(
    () => ({
      "/dashboard": t("navDashboard", "Dashboard"),
      "/devices": t("navDevices", "Devices"),
      "/numbers": t("navNumbers", "Numbers"),
      "/users": t("navUsers", "Users"),
      "/audit": t("navAudit", "Audit"),
      "/logins": t("navLogins", "Logins"),
      "/contacts": t("navContacts", "Contacts"),
      "/config": t("navConfig", "Config")
    }),
    [t]
  );
  const friendlyError = useMemo(() => {
    const key = mapWsErrorKey(status.lastError ?? undefined);
    if (key) return t(key, status.lastError ?? key);
    return status.lastError;
  }, [status.lastError, t]);

  useEffect(() => {
    if (!session && typeof window !== "undefined") {
      router.replace("/login");
    }
  }, [router, session]);

  const rolesConfig = useMemo(() => ((config?.data as any)?.roles ?? {}) as any, [config]);
  const roleOrder = rolesConfig?.order;
  const roleLabels = rolesConfig?.labels ?? {};

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

  async function confirmAndLogout() {
    setConfirmLogout(false);
    await handleLogout();
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
              {navLabels[item.path] ?? item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="shell-main">
        <StatusBar />
        {!status.connected && (
          <div className="banner warn">
            {t("reconnectingBanner", "Reconnecting to realtime stream... showing cached data.")}{" "}
            {friendlyError && mapWsErrorKey(status.lastError ?? undefined) !== "wsOfflineMode" ? `(${friendlyError})` : ""}
          </div>
        )}
        {session.user.requiresPasswordChange && (
          <div className="banner warn">{t("passwordChangeRequired", "Password change required before accessing the console.")}</div>
        )}
        {session.user.requires2fa && (
          <div className="banner warn">{t("mfaRequired", "2FA enrollment required; sign in with MFA to continue.")}</div>
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
        <div className="account-float glass">
          <div className="account-row">
            <div>
              <div className="gg-label">{t("account", "Account")}</div>
              <div className="gg-value">{session.user.email ?? session.user.name}</div>
              {session.user.email && <div className="muted small">{session.user.name}</div>}
            </div>
            <div className="account-actions">
              <button
                className="ghost icon icon-themed"
                onClick={() => setDebugOpen((v) => !v)}
                title={t("debugLabel", "Debug")}
              >
                🛠
              </button>
              <button
                className="ghost icon icon-themed"
                onClick={() => setConfirmLogout(true)}
                title={t("logout", "Logout")}
              >
                ⎋
              </button>
            </div>
          </div>
          <div className="muted small">
            {getRoleLabel(session.user.role, roleLabels)} •{" "}
            {session.user.requires2fa ? t("twoFaRequired", "2FA required") : t("twoFaReady", "2FA ready")}
          </div>
        </div>
        {confirmLogout && (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <div className="modal-card glass">
              <div className="modal-head">
                <div className="modal-icon">⎋</div>
                <div>
                  <div className="gg-title small">{t("logout", "Logout")}</div>
                  <p className="gg-subtitle">{t("logoutConfirm", "Are you sure you want to log out?")}</p>
                </div>
              </div>
              <div className="actions end">
                <button className="ghost" onClick={() => setConfirmLogout(false)}>
                  {t("cancel", "Cancel")}
                </button>
                <button className="primary strong" onClick={confirmAndLogout}>
                  {t("logout", "Logout")}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
