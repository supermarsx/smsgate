"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type StatusSnapshot = {
  connected: boolean;
  ingestLatency?: string;
  clientRtt?: string;
  deviceRtt?: string;
  devicesOnline?: number;
  wsErrors?: number;
  reconnects?: number;
  lastError?: string;
};

type StatusContextValue = StatusSnapshot & {
  setStatus: (next: Partial<StatusSnapshot>) => void;
};

const StatusContext = createContext<StatusContextValue>({
  connected: false,
  setStatus: () => undefined
});

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatusState] = useState<StatusSnapshot>({ connected: false });

  const value = useMemo(
    () => ({
      ...status,
      setStatus: (next: Partial<StatusSnapshot>) => setStatusState((prev) => ({ ...prev, ...next }))
    }),
    [status]
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus(): StatusContextValue {
  return useContext(StatusContext);
}
