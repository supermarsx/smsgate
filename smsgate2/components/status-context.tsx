"use client";

/**
 * @fileoverview Status context for realtime connection metrics and telemetry logs.
 */

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
  logs?: TelemetryEvent[];
};

type StatusContextValue = StatusSnapshot & {
  setStatus: (next: Partial<StatusSnapshot>) => void;
  addLog: (entry: TelemetryEvent) => void;
};

const StatusContext = createContext<StatusContextValue>({
  connected: false,
  setStatus: () => undefined,
  addLog: () => undefined
});

/**
 * Provides realtime status snapshots and telemetry logs to consumers.
 * @returns Provider element for status context.
 */
export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatusState] = useState<StatusSnapshot>({ connected: false, logs: [] });

  const addLog = (entry: TelemetryEvent) => {
    setStatusState((prev) => {
      const nextLogs = [...(prev.logs ?? []), entry].slice(-50);
      return { ...prev, logs: nextLogs };
    });
  };

  const value = useMemo(
    () => ({
      ...status,
      setStatus: (next: Partial<StatusSnapshot>) => setStatusState((prev) => ({ ...prev, ...next })),
      addLog
    }),
    [status]
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

/**
 * Hook to access websocket status and telemetry.
 * @returns Status context snapshot and setters.
 */
export function useStatus(): StatusContextValue {
  return useContext(StatusContext);
}

export type TelemetryEvent = {
  ts: number;
  type: string;
  detail?: string;
};
