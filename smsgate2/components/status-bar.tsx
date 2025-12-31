"use client";

/**
 * @fileoverview Compact websocket status indicator with expandable metrics.
 */

import { useMemo, useState } from "react";
import { useStatus } from "./status-context";
import { getTranslations, useLocale } from "../lib/i18n";

/**
 * Compact websocket status indicator with expandable metrics.
 * @returns Status bar element or null when no status.
 */
export function StatusBar() {
  const status = useStatus();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);

  if (!status) return null;

  const metrics = [
    { key: "ingestLatency", label: t("latencyLabel", "Latency"), value: status.ingestLatency, tone: "info" as const },
    { key: "clientRtt", label: t("clientLatency", "Client RTT"), value: status.clientRtt, tone: "info" as const },
    { key: "deviceRtt", label: t("deviceRttLabel", "Device RTT"), value: status.deviceRtt, tone: "ok" as const },
    {
      key: "devicesOnline",
      label: t("devicesOnline", "Devices online"),
      value: typeof status.devicesOnline === "number" ? status.devicesOnline : undefined,
      tone: "ok" as const
    },
    { key: "wsErrors", label: t("wsErrors", "WS errors"), value: status.wsErrors, tone: "warn" as const },
    { key: "reconnects", label: t("reconnects", "Reconnects"), value: status.reconnects, tone: "warn" as const },
    { key: "lastError", label: t("lastError", "Last error"), value: status.lastError, tone: "warn" as const }
  ];

  const quickIndicators = metrics
    .filter((m) => m.value !== undefined && m.value !== null && m.value !== "")
    .slice(0, 3);
  const moreItems = metrics.filter((m) => m.value !== undefined && m.value !== null && m.value !== "");

  return (
    <div className="status-float" aria-live="polite">
      <div
        className="status-pill-mini"
        data-tip={t("wsStatusTitle", "WS status")}
        role="status"
        aria-label={t("wsStatusTitle", "WS status")}
      >
        <span className={`status-dot ${status.connected ? "ok" : "warn"}`} />
        <span>{status.connected ? t("onlineLabel", "Online") : t("offlineLabel", "Offline")}</span>
      </div>

      {quickIndicators.map((item) => (
        <div key={item.key} className="status-pill-mini" data-tip={item.label}>
          <span className={`dot ${item.tone}`} />
          <span>{item.value}</span>
        </div>
      ))}

      <div
        className="status-pill-mini status-more-btn"
        data-tip={t("wsStatusTitle", "WS status")}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " " ? setOpen((v) => !v) : null)}
      >
        ···
      </div>

      {open && (
        <div className="status-more-panel">
          {moreItems.map((item) => (
            <div key={item.key} className="status-row">
              <span className="muted">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
