"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ConfigPayload } from "../lib/rest";
import { fetchConfig } from "../lib/rest";
import { useSession } from "./session-provider";

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

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const [config, setConfig] = useState<ConfigPayload | null>(null);
  const [etag, setEtag] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  async function load(force = false) {
    if (!session) return;
    setLoading(true);
    try {
      const { config: next, etag: nextEtag, notModified } = await fetchConfig(session, force ? undefined : etag);
      if (!notModified && next) {
        setConfig(next);
        setEtag(nextEtag);
      }
      setError(undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const value = useMemo(
    () => ({
      config,
      refresh: () => load(true),
      etag,
      loading,
      error
    }),
    [config, etag, loading, error]
  );

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): ConfigContextValue {
  return useContext(ConfigContext);
}
