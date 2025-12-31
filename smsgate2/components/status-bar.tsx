"use client";

import { useMemo, useState } from "react";
import { useStatus } from "./status-context";
import { getInitialLocale, getTranslations, type Locale } from "../lib/i18n";

export function StatusBar() {
  const status = useStatus();
  const [locale] = useState<Locale>(getInitialLocale());
  const [open, setOpen] = useState(false);
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);

  if (!status) return null;

  const moreItems = [
    { label: t("wsErrors", "WS errors"), value: status.wsErrors ?? 0 },
    { label: t("reconnects", "Reconnects"), value: status.reconnects ?? 0 },
    { label: t("lastError", "Last error"), value: status.lastError ?? t("statusUnknown", "unknown") }
  ];

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

      {status.ingestLatency && (
        <div className="status-pill-mini" data-tip={t("latencyLabel", "Latency")}>
          <span className="dot info" />
          <span>{status.ingestLatency}</span>
        </div>
      )}

      {status.clientRtt && (
          <div className="status-pill-mini" data-tip={t("latencyLabel", "Latency") + " (client)"}>
          <span className="dot" />
          <span>{status.clientRtt}</span>
        </div>
      )}

      {status.deviceRtt && (
        <div className="status-pill-mini" data-tip={t("devicesLabel", "Devices") + " RTT"}>
          <span className="dot ok" />
          <span>{status.deviceRtt}</span>
        </div>
      )}

      {typeof status.devicesOnline === "number" && (
        <div className="status-pill-mini" data-tip={t("devicesOnline", "Devices online")}>
          <span className="dot ok" />
          <span>{status.devicesOnline}</span>
        </div>
      )}

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
            <div key={item.label} className="status-row">
              <span className="muted">{item.label}</span>
              <span>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
