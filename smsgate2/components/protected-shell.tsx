"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { logout } from "../lib/auth";
import { allowedNav } from "../lib/roles";
import { useSession } from "./session-provider";
import { useStatus } from "./status-context";
import { useTheme } from "./theme";
import { SUPPORTED_LOCALES, getInitialLocale, setPreferredLocale, type Locale } from "../lib/i18n";

type Props = {
  children: React.ReactNode;
};

export function ProtectedShell({ children }: Props) {
  const { session, setSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const status = useStatus();
  const { theme, toggle } = useTheme();
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

  const navItems = useMemo(() => (session ? allowedNav(session.user.role) : []), [session]);
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
        <div className="login-error">Unauthorized for this route; redirecting...</div>
      </div>
    );
  }

  return (
    <div className={`shell ${navOpen ? "nav-open" : ""}`}>
      <aside className="shell-nav">
        <div className="nav-brand-row">
          <div className="nav-brand">smsgate2</div>
          <button className="ghost nav-toggle" onClick={() => setNavOpen((v) => !v)}>
            {navOpen ? "Close" : "Menu"}
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
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <section className="shell-main">
        <header className="shell-topbar">
          <div className="topbar-meta">
            <span className="pill pill-muted">{session.user.role}</span>
            <div className="account-chip">
              <div className="gg-label">Account</div>
              <div className="gg-value">{session.user.email ?? session.user.name}</div>
              {session.user.email && <div className="muted small">{session.user.name}</div>}
            </div>
            <span className={`badge ${session.user.requires2fa ? "degraded" : "online"}`}>
              {session.user.requires2fa ? "2FA required" : "2FA ready"}
            </span>
          </div>
          <div className="topbar-actions">
            <div className={`status-chip ${status.connected ? "ok" : "warn"}`} title={status.lastError ?? "WS status"}>
              <span className={`status-dot ${status.connected ? "" : "warn"}`} />
              <div className="chip-label">WS</div>
              <div className="chip-value">{status.connected ? "Online" : "Offline"}</div>
              <div className="muted small">RTT {status.clientRtt ?? "-"}</div>
            </div>
            <div className="status-chip info" title="Device presence and RTT">
              <span className="status-dot" />
              <div className="chip-label">Devices</div>
              <div className="chip-value">{status.devicesOnline ?? 0} online</div>
              <div className="muted small">RTT {status.deviceRtt ?? "-"}</div>
            </div>
            <div className="status-chip ok" title="Ingest to render latency">
              <span className="status-dot" />
              <div className="chip-label">Latency</div>
              <div className="chip-value">{status.ingestLatency ?? "-"}</div>
              <div className="muted small">Errors {status.wsErrors ?? 0}</div>
            </div>
            <div className="status-chip" title="WS reconnects">
              <span className="status-dot" />
              <div className="chip-label">Reconnects</div>
              <div className="chip-value">{status.reconnects ?? 0}</div>
              <div className="muted small">Role {session.user.role}</div>
            </div>
            <button className="ghost" onClick={toggle} title="Toggle theme">
              Theme: {theme === "dark" ? "Dark" : "Light"}
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
              Debug
            </button>
            <button className="ghost" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>
        {!status.connected && (
          <div className="banner warn">
            Reconnecting to realtime stream... showing cached data. {status.lastError ? `(${status.lastError})` : ""}
          </div>
        )}
        {debugOpen && (
          <div className="debug-overlay">
            <div className="gg-label">Debug snapshot</div>
            <pre className="pairing-pre">{JSON.stringify(status, null, 2)}</pre>
            <div className="actions">
              <button className="ghost" onClick={() => setShowLogs((v) => !v)}>
                {showLogs ? "Hide logs" : "Show logs"}
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
        <div className="shell-content">{children}</div>
      </section>
    </div>
  );
}
