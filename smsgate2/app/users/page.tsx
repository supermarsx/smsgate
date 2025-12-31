"use client";

/**
 * @fileoverview Users page for roles, status toggles, logout/unlock, and credentials.
 */

import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useConfig } from "../../components/config-provider";
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
import { getTranslations, useLocale } from "../../lib/i18n";

/**
 * User management page for roles, status toggles, logout/unlock, and credentials.
 * @returns Users page element.
 */
export default function UsersPage() {
  const { session } = useSession();
  const { config } = useConfig();
  const locale = useLocale();
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [devicePhones, setDevicePhones] = useState<Record<string, string>>({});
  const [assignments, setAssignments] = useState<Record<string, { numbers?: string[]; devices?: string[] }>>({});
  const rolesConfig = useMemo(() => ((config?.data as any)?.roles ?? {}) as any, [config]);
  const roleOrder = rolesConfig.order?.length ? rolesConfig.order : DEFAULT_ROLE_ORDER;
  const roleLabels = rolesConfig.labels ?? {};

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listUsers(session)
      .then((rows) => {
        setUsers(rows);
        const map: Record<string, { numbers?: string[]; devices?: string[] }> = {};
        rows.forEach((u: any) => {
          map[u.id] = {
            numbers: Array.isArray(u.numbers ?? u.assignedNumbers) ? (u.numbers ?? u.assignedNumbers) : undefined,
            devices: Array.isArray(u.devices ?? u.assignedDevices) ? (u.devices ?? u.assignedDevices) : undefined
          };
        });
        setAssignments(map);
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return null;

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">{t("usersTitle", "Users")}</div>
          <h1 className="gg-title">{t("usersSubtitle", "User management")}</h1>
          <p className="gg-subtitle">
            {t("usersDescription", "List users with roles/auth mode; edit roles; force logout/unlock per permissions.")}
          </p>
        </div>
        {error && (
          <div className="login-error">
            {t("usersError", "Error")}: {error}
          </div>
        )}
        {loading && <div className="muted">{t("usersLoading", "Loading...")}</div>}
        <div className="presence-list">
          {users.map((u) => (
            <div key={u.id ?? u.email} className="presence-row spaced">
              <div>
                <div className="gg-value">{u.name ?? u.email ?? u.id}</div>
                <div className="muted">
                  {t("roleLabel", "Role")}: {getRoleLabel(u.role, roleLabels)} | {t("authModeLabel", "Auth")}:{" "}
                  {u.authMode ?? "-"} | {t("statusLabel", "Status")}:{" "}
                  {u.disabled ? t("disabledLabel", "disabled") : t("activeLabel", "active")}
                </div>
                {u.locked && <div className="login-error">{t("lockedOut", "Locked out")}</div>}
                {Array.isArray(u.groups) && (
                  <div className="muted">
                    {t("groupsLabel", "Groups")}: {u.groups.join(", ")}
                  </div>
                )}
                {u.devicePhone && (
                  <div className="muted">
                    {t("devicePhone", "Device phone")}: {u.devicePhone}
                  </div>
                )}
                {assignments[u.id]?.numbers && assignments[u.id]?.numbers?.length && (
                  <div className="muted">
                    {t("usersAssignedNumbers", "Assigned numbers")}: {assignments[u.id]?.numbers?.join(", ")}
                  </div>
                )}
                {assignments[u.id]?.devices && assignments[u.id]?.devices?.length && (
                  <div className="muted">
                    {t("usersAssignedDevices", "Assigned devices")}: {assignments[u.id]?.devices?.join(", ")}
                  </div>
                )}
                {typeof u.lastLogin === "string" && (
                  <div className="muted">
                    {t("usersLastLogin", "Last login")}: {u.lastLogin}
                  </div>
                )}
                {typeof u.failedLogins === "number" && (
                  <div className="muted">
                    {t("usersFailedLogins", "Failed logins")}: {u.failedLogins}
                  </div>
                )}
                {Array.isArray(u.groups) && (
                  <div className="muted">
                    {t("groupsLabel", "Groups")}: {u.groups.join(", ")}
                  </div>
                )}
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
                  {u.disabled ? t("enable", "Enable") : t("disable", "Disable")}
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
                  {t("forceLogout", "Force logout")}
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
                  {t("unlock", "Unlock")}
                </button>
                <input
                  className="gg-input"
                  placeholder={t("newPassword", "New password")}
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
                  {t("resetPassword", "Reset password")}
                </button>
                <input
                  className="gg-input"
                  placeholder={t("devicePhone", "Device phone")}
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
                  {t("mapDevicePhone", "Map device phone")}
                </button>
              </div>
            </div>
          ))}
          {!users.length && !loading && <div className="muted">{t("noUsers", "No users yet.")}</div>}
        </div>
      </div>
    </ProtectedShell>
  );
}
