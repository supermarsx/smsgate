"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { getLoginEvents } from "../../lib/rest";

export default function LoginsPage() {
  const { session } = useSession();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!session) return null;

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    getLoginEvents(session)
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

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
        <div className="presence-list">
          {rows.map((r, idx) => (
            <div key={idx} className="presence-row spaced">
              <div>
                <div className="gg-value">{r.status ?? r.result ?? "unknown"}</div>
                <div className="muted">{r.user ?? r.username ?? "user"} @ {r.timestamp ?? "—"}</div>
              </div>
            </div>
          ))}
          {!rows.length && !loading && <div className="muted">No login events yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
