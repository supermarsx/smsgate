"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "../lib/auth";
import { allowedNav, hasAtLeast } from "../lib/roles";
import { useSession } from "./session-provider";
import { useStatus } from "./status-context";
import { useTheme } from "./theme";

type Props = {
  children: React.ReactNode;
};

export function ProtectedShell({ children }: Props) {
  const { session, setSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const status = useStatus();
  const { theme, toggle } = useTheme();

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

  return (
    <div className="shell">
      <aside className="shell-nav">
        <div className="nav-brand">smsgate2</div>
        <nav>
          {navItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`nav-link ${pathname === item.path ? "is-active" : ""}`}
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
