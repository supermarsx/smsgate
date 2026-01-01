"use client";

/**
 * @fileoverview Session provider for managing authentication state and refresh logic.
 */

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

/**
 * Stores the active session, refreshes tokens, and exposes session state to children.
 * @returns Provider element for session context.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.resolve(loadSession()).then((existing) => {
      setSession(existing);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!session?.refreshToken) return;
    let cancelled = false;
    async function maybeRefresh() {
      if (!session) return;
      if (!sessionExpiresSoon(session)) return;
      const refreshed = await refreshSession(session.refreshToken!);
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

/**
 * Hook to access or mutate the current session.
 * @returns Session context value.
 */
export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}

/**
 * Hook that throws when a session is not present (use in server-side boundaries).
 * @returns Active session or throws when missing.
 */
export function useRequireSession(): Session {
  const { session } = useSession();
  if (!session) {
    clearSession();
    throw new Error("Unauthenticated");
  }
  return session;
}
