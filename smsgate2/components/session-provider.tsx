"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { clearSession, loadSession, refreshSession, sessionExpiresSoon, type Session } from "../lib/auth";

type SessionContextValue = {
  session: Session | null;
  setSession: (s: Session | null) => void;
  loading: boolean;
};

const SessionContext = createContext<SessionContextValue>({
  session: null,
  setSession: () => undefined,
  loading: true
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const existing = loadSession();
    setSession(existing);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.refreshToken) return;
    let cancelled = false;
    async function maybeRefresh() {
      if (!session) return;
      if (!sessionExpiresSoon(session)) return;
      const refreshed = await refreshSession(session.refreshToken);
      if (!cancelled && refreshed) {
        setSession(refreshed);
      }
    }
    const timer = window.setInterval(maybeRefresh, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session]);

  const value = useMemo(() => ({ session, setSession, loading }), [session, loading]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

export function useRequireSession(): Session {
  const { session } = useSession();
  if (!session) {
    clearSession();
    throw new Error("Unauthenticated");
  }
  return session;
}
