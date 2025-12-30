"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useMemo, useState } from "react";
import { getLoginEvents } from "../../lib/rest";

export default function LoginsPage() {
  const { session } = useSession();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<string>("__all__");
  const [ipFilter, setIpFilter] = useState<string>("");
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
    getLoginEvents(session)
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  const pageSize = 10;
  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return rows.filter((r) => {
      const matchesText = [r.user, r.username, r.status, r.ip].some((field: any) =>
        String(field ?? "")
          .toLowerCase()
          .includes(term)
      );
      const matchesResult = result === "__all__" ? true : (r.status ?? r.result) === result;
      const matchesIp = ipFilter ? String(r.ip ?? "").includes(ipFilter) : true;
      const matchesTime = cutoff ? Date.parse(r.timestamp ?? r.createdAt ?? "") >= cutoff : true;
      return matchesText && matchesResult && matchesIp && matchesTime;
    });
  }, [rows, filter, result, ipFilter, cutoff]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize);

  function exportCsv(items: any[]) {
    const header = ["user", "status", "ip", "timestamp"];
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
    a.download = "login-events.csv";
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
          <div className="gg-pill">Logins</div>
          <h1 className="gg-title">Login events</h1>
          <p className="gg-subtitle">Surface login history, failures, and lockouts to meet spec requirements.</p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        {loading && <div className="muted">Loading...</div>}
        <div className="filter-row">
          <label className="gg-label" htmlFor="login-filter">
            Filter
          </label>
          <input
            id="login-filter"
            className="gg-input"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(0);
            }}
            placeholder="Search user/status/ip"
          />
        </div>
        <div className="filter-row">
          <label className="gg-label" htmlFor="login-result">
            Result
          </label>
          <select
            id="login-result"
            className="gg-select"
            value={result}
            onChange={(e) => {
              setResult(e.target.value);
              setPage(0);
            }}
          >
            <option value="__all__">All</option>
            <option value="success">success</option>
            <option value="fail">fail</option>
          </select>
          <label className="gg-label" htmlFor="login-ip">
            IP
          </label>
          <input
            id="login-ip"
            className="gg-input"
            value={ipFilter}
            onChange={(e) => {
              setIpFilter(e.target.value);
              setPage(0);
            }}
            placeholder="10.0.0.1"
          />
          <label className="gg-label" htmlFor="login-time">
            Time
          </label>
          <select
            id="login-time"
            className="gg-select"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as "all" | "1h" | "24h")}
          >
            <option value="all">All</option>
            <option value="1h">Last hour</option>
            <option value="24h">Last 24h</option>
          </select>
        </div>
        <div className="presence-list">
          {paged.map((r, idx) => (
            <div key={`${page}-${idx}`} className="presence-row spaced">
              <div>
                <div className="gg-value">{r.status ?? r.result ?? "unknown"}</div>
                <div className="muted">
                  {r.user ?? r.username ?? "user"} @ {r.timestamp ?? "—"} | IP: {r.ip ?? "—"}
                </div>
              </div>
            </div>
          ))}
          {!rows.length && !loading && <div className="muted">No login events yet.</div>}
        </div>
        <div className="pagination">
          <button className="ghost" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            Prev
          </button>
          <span className="muted">
            Page {page + 1} / {pageCount}
          </span>
          <button
            className="ghost"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
          </button>
          <button
            className="ghost"
            onClick={() => {
              const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "login-events.json";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export JSON
          </button>
          <button className="ghost" onClick={() => exportCsv(filtered)}>
            Export CSV
          </button>
        </div>
      </div>
    </ProtectedShell>
  );
}
