"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { listUsers } from "../../lib/rest";

export default function UsersPage() {
  const { session } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!session) return null;

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listUsers(session)
      .then(setUsers)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Users</div>
          <h1 className="gg-title">User management</h1>
          <p className="gg-subtitle">
            List users with roles/auth mode; edit roles; force logout/unlock per permissions.
          </p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        {loading && <div className="muted">Loading...</div>}
        <div className="presence-list">
          {users.map((u) => (
            <div key={u.id ?? u.email} className="presence-row spaced">
              <div>
                <div className="gg-value">{u.name ?? u.email ?? u.id}</div>
                <div className="muted">Role: {u.role ?? "—"} | Auth: {u.authMode ?? "—"}</div>
              </div>
            </div>
          ))}
          {!users.length && !loading && <div className="muted">No users yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
