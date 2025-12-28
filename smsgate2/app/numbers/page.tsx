"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { listNumbers } from "../../lib/rest";

export default function NumbersPage() {
  const { session } = useSession();
  const [numbers, setNumbers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!session) return null;

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listNumbers(session)
      .then(setNumbers)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Numbers</div>
          <h1 className="gg-title">Assign and manage numbers</h1>
          <p className="gg-subtitle">CRUD numbers and assign/unassign to users/devices per spec.</p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        {loading && <div className="muted">Loading...</div>}
        <div className="presence-list">
          {numbers.map((n) => (
            <div key={n.id ?? n.e164} className="presence-row spaced">
              <div>
                <div className="gg-value">{n.e164 ?? n.number}</div>
                <div className="muted">Assigned to: {n.assignedTo ?? "—"}</div>
              </div>
            </div>
          ))}
          {!numbers.length && !loading && <div className="muted">No numbers yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
