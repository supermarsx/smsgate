"use client";

/**
 * @fileoverview Config context provider that loads remote settings and syncs role metadata.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ConfigPayload } from "../lib/rest";
import { fetchConfig } from "../lib/rest";
import { useSession } from "./session-provider";
import { configureRoles } from "../lib/roles";

type ConfigContextValue = {
  config: ConfigPayload | null;
  refresh: () => Promise<void>;
  etag?: string;
  loading: boolean;
  error?: string;
};

const ConfigContext = createContext<ConfigContextValue>({
  config: null,
  refresh: async () => undefined,
  loading: true
});

/**
 * Loads remote configuration, exposes it via context, and keeps role settings in sync.
 * @returns Provider element supplying configuration context.
 */
export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [etag, setEtag] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(
    async (force = false) => {
      if (!session) return;
      setLoading(true);
      try {
        const { config: next, etag: nextEtag, notModified } = await fetchConfig(session, force ? undefined : etag);
        if (!notModified && next) {
          setConfig(next);
          setEtag(nextEtag);
          const rolesCfg = ((next?.data as any)?.roles ?? {}) as { order?: string[]; labels?: Record<string, string> };
          configureRoles({ order: rolesCfg.order, labels: rolesCfg.labels });
        }
        setError(undefined);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [etag, session]
  );

  useEffect(() => {
    load(true);
  }, [load, session?.accessToken]);

  const value = useMemo(
    () => ({
      config,
      refresh: () => load(true),
      etag,
      loading,
      error
    }),
    [config, etag, loading, error, load]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/**
 * Access the current configuration context.
 * @returns Current configuration value with refresh helper.
 */
export function useConfig(): ConfigContextValue {
  return useContext(ConfigContext);
}
