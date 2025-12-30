"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { forceLogoutUser, listUsers, unlockUser, updateUserRole } from "../../lib/rest";

export default function UsersPage() {
  const { session } = useSession();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listUsers(session)
      .then(setUsers)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return null;

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
                <div className="muted">
                  Role: {u.role ?? "—"} | Auth: {u.authMode ?? "—"}
                </div>
                {Array.isArray(u.groups) && <div className="muted">Groups: {u.groups.join(", ")}</div>}
              </div>
              <div className="actions">
                <select
                  className="gg-select"
                  value={u.role}
                  onChange={async (e) => {
                    if (!session) return;
                    setPending(u.id);
                    try {
                      await updateUserRole(session, u.id, e.target.value);
                      const next = await listUsers(session);
                      setUsers(next);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  {["viewer", "verifier", "manager", "admin"].map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <button
                  className="ghost"
                  disabled={pending === u.id}
                  onClick={async () => {
                    if (!session) return;
                    setPending(u.id);
                    try {
                      await forceLogoutUser(session, u.id);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  Force logout
                </button>
                <button
                  className="ghost"
                  disabled={pending === u.id}
                  onClick={async () => {
                    if (!session) return;
                    setPending(u.id);
                    try {
                      await unlockUser(session, u.id);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  Unlock
                </button>
              </div>
            </div>
          ))}
          {!users.length && !loading && <div className="muted">No users yet.</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
