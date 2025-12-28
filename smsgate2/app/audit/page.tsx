"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { getAudit } from "../../lib/rest";

export default function AuditPage() {
  const { session } = useSession();
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!session) return null;

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    getAudit(session)
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Audit</div>
          <h1 className="gg-title">Audit log</h1>
          <p className="gg-subtitle">Tables with filters (time, actor, action, device, number) and pagination/export.</p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        {loading && <div className="muted">Loading...</div>}
        <div className="presence-list">
          {rows.map((r, idx) => (
            <div key={idx} className="presence-row spaced">
              <div>
                <div className="gg-value">{r.action ?? r.type ?? "event"}</div>
                <div className="muted">{r.actor ?? "unknown"} @ {r.timestamp ?? "—"}</div>
              </div>
            </div>
          ))}
          {!rows.length && !loading && <div className="muted">No audit events yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
