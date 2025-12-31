"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useMemo, useState } from "react";
import { getAudit } from "../../lib/rest";
import { getInitialLocale, getTranslations } from "../../lib/i18n";

/**
 * Audit log table with filtering, paging, and export.
 */
export default function AuditPage() {
  const { session } = useSession();
  const locale = getInitialLocale();
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<string>("__all__");
  const [deviceFilter, setDeviceFilter] = useState<string>("");
  const [numberFilter, setNumberFilter] = useState<string>("");
  const [timeRange, setTimeRange] = useState<"all" | "1h" | "24h">("all");
  const [cutoff, setCutoff] = useState<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    if (timeRange === "1h") setCutoff(now - 60 * 60 * 1000);
    else if (timeRange === "24h") setCutoff(now - 24 * 60 * 60 * 1000);
    else setCutoff(null);
  }, [timeRange]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    getAudit(session)
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  const pageSize = 10;
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return rows.filter((r) => {
      const matchesText = [r.action, r.actor, r.device, r.number].some((field: any) =>
        String(field ?? "")
          .toLowerCase()
          .includes(term)
      );
      const matchesResult = result === "__all__" ? true : (r.result ?? r.status) === result;
      const matchesDevice = deviceFilter ? String(r.device ?? "").includes(deviceFilter) : true;
      const matchesNumber = numberFilter ? String(r.number ?? "").includes(numberFilter) : true;
      const matchesTime = cutoff ? Date.parse(r.timestamp ?? r.createdAt ?? "") >= cutoff : true;
      return matchesText && matchesResult && matchesDevice && matchesNumber && matchesTime;
    });
  }, [rows, filter, result, deviceFilter, numberFilter, cutoff]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function exportCsv(items: any[]) {
    const header = ["action", "actor", "device", "number", "timestamp"];
    const body = items.map((r) =>
      header
        .map((h) => {
          const val = r[h] ?? "";
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(",")
    );
    const csv = [header.join(","), ...body].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit.csv";
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  if (!session) return null;

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">{t("auditTitle", "Audit")}</div>
          <h1 className="gg-title">{t("auditSubtitle", "Audit log")}</h1>
          <p className="gg-subtitle">
            {t("auditDescription", "Tables with filters (time, actor, action, device, number) and pagination/export.")}
          </p>
        </div>
        {error && (
          <div className="login-error">
            {t("errorPrefix", "Error")}: {error}
          </div>
        )}
        {loading && <div className="muted">{t("loading", "Loading...")}</div>}
        <div className="audit-filters">
          <div className="audit-filter">
            <label className="gg-label" htmlFor="audit-filter">
              {t("filter", "Filter")}
            </label>
            <input
              id="audit-filter"
              className="gg-input"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              placeholder={t("auditSearch", "Search actor/action/device/number")}
            />
          </div>
          <div className="audit-filter-grid">
            <div className="filter-group">
              <label className="gg-label" htmlFor="audit-result">
                {t("resultLabel", "Result")}
              </label>
              <select
                id="audit-result"
                className="gg-select"
                value={result}
                onChange={(e) => {
                  setResult(e.target.value);
                  setPage(0);
                }}
              >
                <option value="__all__">{t("all", "All")}</option>
                <option value="success">{t("auditSuccess", "success")}</option>
                <option value="fail">{t("auditFail", "fail")}</option>
              </select>
            </div>
            <div className="filter-group">
              <label className="gg-label" htmlFor="audit-device">
                {t("deviceLabel", "Device")}
              </label>
              <input
                id="audit-device"
                className="gg-input"
                value={deviceFilter}
                onChange={(e) => {
                  setDeviceFilter(e.target.value);
                  setPage(0);
                }}
                placeholder={t("numbersDeviceIdPlaceholder", "device id")}
              />
            </div>
            <div className="filter-group">
              <label className="gg-label" htmlFor="audit-number">
                {t("numbersLabel", "Numbers")}
              </label>
              <input
                id="audit-number"
                className="gg-input"
                value={numberFilter}
                onChange={(e) => {
                  setNumberFilter(e.target.value);
                  setPage(0);
                }}
                placeholder={t("auditNumberPlaceholder", "+1555")}
              />
            </div>
            <div className="filter-group">
              <label className="gg-label" htmlFor="audit-time">
                {t("timeLabel", "Time")}
              </label>
              <select
                id="audit-time"
                className="gg-select"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as "all" | "1h" | "24h")}
              >
                <option value="all">{t("all", "All")}</option>
                <option value="1h">{t("lastHour", "Last hour")}</option>
                <option value="24h">{t("last24h", "Last 24h")}</option>
              </select>
            </div>
          </div>
        </div>
        <div className="presence-list">
          {paged.map((r, idx) => (
            <div key={`${page}-${idx}`} className="presence-row spaced">
              <div>
                <div className="gg-value">{r.action ?? r.type ?? "event"}</div>
                <div className="muted">
                  {r.actor ?? t("actorUnknown", "unknown")} @ {r.timestamp ?? "-"} |{" "}
                  {r.device ?? t("devicePlaceholder", "device")} | {r.number ?? t("numberPlaceholder", "number")}
                </div>
              </div>
            </div>
          ))}
          {!rows.length && !loading && <div className="muted">{t("auditNoEvents", "No audit events yet.")}</div>}
        </div>
        <div className="pagination">
          <button className="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            {t("prev", "Prev")}
          </button>
          <span className="muted">
            {t("pageLabel", "Page")} {page + 1} / {pageCount}
          </span>
          <button
            className="ghost"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            {t("next", "Next")}
          </button>
          <button
            className="ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "audit.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t("exportJson", "Export JSON")}
          </button>
          <button className="ghost" onClick={() => exportCsv(filtered)}>
            {t("exportCsv", "Export CSV")}
          </button>
        </div>
      </div>
    </ProtectedShell>
  );
}
