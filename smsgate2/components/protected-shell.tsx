"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logout } from "../lib/auth";
import { allowedNav, hasAtLeast } from "../lib/roles";
import { useSession } from "./session-provider";

type Props = {
  children: React.ReactNode;
};

export function ProtectedShell({ children }: Props) {
  const { session, setSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();

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
            <span className={`status-dot ${session.user.requires2fa ? "warn" : "ok"}`} />
            <button className="ghost" onClick={handleLogout}>Logout</button>
          </div>
        </header>
        <div className="shell-content">{children}</div>
      </section>
    </div>
  );
}
