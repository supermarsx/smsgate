"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "../lib/auth";
import { allowedNav, hasAtLeast } from "../lib/roles";
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

  if (!session) {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }

  const navItems = allowedNav(session.user.role);

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
            <span>{session.user.name}</span>
            {session.user.email && <span className="muted">{session.user.email}</span>}
          </div>
          <div className="topbar-actions">
            <span className={`status-dot ${status.connected ? "ok" : "warn"}`} title={status.lastError ?? "WS status"} />
            <span className="muted">WS: {status.connected ? "Online" : "Offline"}</span>
            <span className="muted">RTT: {status.clientRtt ?? "—"}</span>
            <span className="muted">Device RTT: {status.deviceRtt ?? "—"}</span>
            <span className="muted">Latency: {status.ingestLatency ?? "—"}</span>
            <button className="ghost" onClick={toggle} title="Toggle theme">
              {theme === "dark" ? "Light" : "Dark"}
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
            <span className={`status-dot ${session.user.requires2fa ? "warn" : "ok"}`} title="2FA status" />
            <button className="ghost" onClick={handleLogout}>Logout</button>
          </div>
        </header>
        {!status.connected && (
          <div className="banner warn">
            Reconnecting to realtime stream... showing cached data. {status.lastError ? `(${status.lastError})` : ""}
          </div>
        )}
        <div className="shell-content">{children}</div>
      </section>
    </div>
  );
}
