"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useConfig } from "../../components/config-provider";
import { useEffect, useMemo, useState } from "react";
import {
  disableUser,
  enableUser,
  forceLogoutUser,
  listUsers,
  mapDevicePhone,
  resetUserPassword,
  unlockUser,
  updateUserRole
} from "../../lib/rest";
import { DEFAULT_ROLE_ORDER, getRoleLabel } from "../../lib/roles";

export default function UsersPage() {
  const { session } = useSession();
  const { config } = useConfig();
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [devicePhones, setDevicePhones] = useState<Record<string, string>>({});
  const rolesConfig = useMemo(() => ((config?.data as any)?.roles ?? {}) as any, [config]);
  const roleOrder = rolesConfig.order?.length ? rolesConfig.order : DEFAULT_ROLE_ORDER;
  const roleLabels = rolesConfig.labels ?? {};

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
                  Role: {getRoleLabel(u.role, roleLabels)} | Auth: {u.authMode ?? "-"} | Status:{" "}
                  {u.disabled ? "disabled" : "active"}
                </div>
                {u.locked && <div className="login-error">Locked out</div>}
                {Array.isArray(u.groups) && <div className="muted">Groups: {u.groups.join(", ")}</div>}
                {u.devicePhone && <div className="muted">Device phone: {u.devicePhone}</div>}
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
                  {roleOrder.map((role: string) => (
                    <option key={role} value={role}>
                      {getRoleLabel(role, roleLabels)}
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
                      if (u.disabled) {
                        await enableUser(session, u.id);
                      } else {
                        await disableUser(session, u.id);
                      }
                      const next = await listUsers(session);
                      setUsers(next);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </button>
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
                <input
                  className="gg-input"
                  placeholder="New password"
                  value={passwords[u.id] ?? ""}
                  onChange={(e) => setPasswords((prev) => ({ ...prev, [u.id]: e.target.value }))}
                />
                <button
                  className="ghost"
                  disabled={pending === u.id || !passwords[u.id]}
                  onClick={async () => {
                    if (!session) return;
                    setPending(u.id);
                    try {
                      await resetUserPassword(session, u.id, passwords[u.id]);
                      setPasswords((prev) => ({ ...prev, [u.id]: "" }));
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  Reset password
                </button>
                <input
                  className="gg-input"
                  placeholder="Device phone"
                  value={devicePhones[u.id] ?? ""}
                  onChange={(e) => setDevicePhones((prev) => ({ ...prev, [u.id]: e.target.value }))}
                />
                <button
                  className="ghost"
                  disabled={pending === u.id}
                  onClick={async () => {
                    if (!session) return;
                    setPending(u.id);
                    try {
                      await mapDevicePhone(session, u.id, devicePhones[u.id]);
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setPending(null);
                    }
                  }}
                >
                  Map device phone
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
