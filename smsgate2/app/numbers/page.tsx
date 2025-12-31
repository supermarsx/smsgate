"use client";

/**
 * @fileoverview Number management page for CRUD and assignments.
 */

import { useEffect, useMemo, useState } from "react";
import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { assignNumber, createNumber, deleteNumber, listNumbers, unassignNumber, updateNumber } from "../../lib/rest";
import { getInitialLocale, getTranslations } from "../../lib/i18n";

/**
 * Number management page for CRUD and assignment to users/devices.
 * @returns Numbers page element.
 */
export default function NumbersPage() {
  const { session } = useSession();
  const locale = getInitialLocale();
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState({ e164: "", label: "" });
  const [assignForm, setAssignForm] = useState({ e164: "", userId: "", deviceId: "" });
  const [edit, setEdit] = useState<Record<string, { label?: string; shared?: boolean; defaultDeviceId?: string }>>({});

  function validateE164(value: string): boolean {
    return /^\+?[1-9]\d{6,15}$/.test(value.trim());
  }

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    listNumbers(session)
      .then(setNumbers)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [session]);

  if (!session) return null;

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">{t("numbersTitle", "Numbers")}</div>
          <h1 className="gg-title">{t("numbersSubtitle", "Assign and manage numbers")}</h1>
          <p className="gg-subtitle">
            {t("numbersDescription", "CRUD numbers and assign/unassign to users/devices per spec.")}
          </p>
        </div>
        {error && (
          <div className="login-error">
            {t("numbersError", "Error")}: {error}
          </div>
        )}
        {loading && <div className="muted">{t("numbersLoading", "Loading...")}</div>}
        <div className="presence-list">
          {numbers.map((n) => (
            <div key={n.id ?? n.e164} className="presence-row spaced">
              <div>
                <div className="gg-value">{n.e164 ?? n.number}</div>
                <div className="muted">
                  {t("numbersAssignedTo", "Assigned to")}: {n.assignedTo ?? "-"}
                </div>
                <div className="muted">
                  {t("numbersShared", "Shared")}: {n.shared ? t("sharedYes", "yes") : t("sharedNo", "no")}
                </div>
                <div className="muted">
                  {t("numbersDefaultDevice", "Default device")}: {n.defaultDeviceId ?? "-"}
                </div>
                <div className="filter-row">
                  <label className="gg-label" htmlFor={`label-${n.e164}`}>
                    {t("numbersLabelField", "Label")}
                  </label>
                  <input
                    id={`label-${n.e164}`}
                    className="gg-input"
                    value={edit[n.e164]?.label ?? n.label ?? ""}
                    onChange={(e) =>
                      setEdit((prev) => ({ ...prev, [n.e164]: { ...(prev[n.e164] ?? {}), label: e.target.value } }))
                    }
                  />
                  <label className="gg-label" htmlFor={`shared-${n.e164}`}>
                    {t("numbersShared", "Shared")}
                  </label>
                  <input
                    id={`shared-${n.e164}`}
                    type="checkbox"
                    checked={edit[n.e164]?.shared ?? n.shared ?? false}
                    onChange={(e) =>
                      setEdit((prev) => ({ ...prev, [n.e164]: { ...(prev[n.e164] ?? {}), shared: e.target.checked } }))
                    }
                  />
                  <label className="gg-label" htmlFor={`default-device-${n.e164}`}>
                    {t("numbersDefaultDevice", "Default device")}
                  </label>
                  <input
                    id={`default-device-${n.e164}`}
                    className="gg-input"
                    value={edit[n.e164]?.defaultDeviceId ?? n.defaultDeviceId ?? ""}
                    onChange={(e) =>
                      setEdit((prev) => ({
                        ...prev,
                        [n.e164]: { ...(prev[n.e164] ?? {}), defaultDeviceId: e.target.value }
                      }))
                    }
                    placeholder={t("numbersDeviceIdPlaceholder", "device id")}
                  />
                </div>
              </div>
              <div className="actions">
                <button
                  className="ghost"
                  onClick={async () => {
                    if (!session) return;
                    try {
                      const payload = edit[n.e164] ?? {};
                      await updateNumber(session, n.e164 ?? n.number, {
                        label: payload.label ?? n.label,
                        shared: payload.shared ?? n.shared,
                        defaultDeviceId: payload.defaultDeviceId ?? n.defaultDeviceId ?? null
                      });
                      const next = await listNumbers(session);
                      setNumbers(next);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  {t("save", "Save")}
                </button>
                <button
                  className="ghost"
                  onClick={async () => {
                    if (!session) return;
                    try {
                      await deleteNumber(session, n.e164 ?? n.number);
                      const next = await listNumbers(session);
                      setNumbers(next);
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}
                >
                  {t("delete", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!numbers.length && !loading && <div className="muted">{t("numbersEmpty", "No numbers yet.")}</div>}
        </div>
        <div className="gg-section">
          <h3 className="gg-section__title">{t("addNumber", "Add number")}</h3>
          <div className="filter-row">
            <label className="gg-label" htmlFor="num-e164">
              {t("numbersE164Label", "E.164")}
            </label>
            <input
              id="num-e164"
              className="gg-input"
              value={form.e164}
              onChange={(e) => setForm({ ...form, e164: e.target.value })}
              placeholder={t("numbersE164Placeholder", "+15551234567")}
            />
            <label className="gg-label" htmlFor="num-label">
              {t("numbersLabelField", "Label")}
            </label>
            <input
              id="num-label"
              className="gg-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder={t("simSlot", "SIM slot or nickname")}
            />
            <button
              className="login-submit"
              disabled={creating}
              onClick={async () => {
                if (!session) return;
                if (!validateE164(form.e164)) {
                  setError(t("numbersInvalidE164", "Enter a valid E.164 number"));
                  return;
                }
                setCreating(true);
                setError(null);
                try {
                  await createNumber(session, { e164: form.e164, label: form.label || undefined });
                  const next = await listNumbers(session);
                  setNumbers(next);
                  setForm({ e164: "", label: "" });
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setCreating(false);
                }
              }}
            >
              {creating ? t("numbersAdding", "Adding...") : t("addNumber", "Add number")}
            </button>
          </div>
        </div>
        <div className="gg-section">
          <h3 className="gg-section__title">{t("assignUnassign", "Assign/unassign")}</h3>
          <div className="filter-row">
            <label className="gg-label" htmlFor="assign-e164">
              {t("numbersE164Label", "E.164")}
            </label>
            <input
              id="assign-e164"
              className="gg-input"
              value={assignForm.e164}
              onChange={(e) => setAssignForm({ ...assignForm, e164: e.target.value })}
            />
            <label className="gg-label" htmlFor="assign-user">
              {t("numbersUserId", "User ID")}
            </label>
            <input
              id="assign-user"
              className="gg-input"
              value={assignForm.userId}
              onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}
              placeholder={t("optional", "optional")}
            />
            <label className="gg-label" htmlFor="assign-device">
              {t("numbersDeviceId", "Device ID")}
            </label>
            <input
              id="assign-device"
              className="gg-input"
              value={assignForm.deviceId}
              onChange={(e) => setAssignForm({ ...assignForm, deviceId: e.target.value })}
              placeholder={t("optional", "optional")}
            />
            <div className="actions">
              <button
                className="login-submit"
                disabled={assigning}
                onClick={async () => {
                  if (!session) return;
                  if (!validateE164(assignForm.e164)) {
                    setError(t("numbersInvalidAssign", "Enter a valid E.164 number to assign"));
                    return;
                  }
                  setAssigning(true);
                  setError(null);
                  try {
                    await assignNumber(session, assignForm.e164, {
                      userId: assignForm.userId || undefined,
                      deviceId: assignForm.deviceId || undefined
                    });
                    const next = await listNumbers(session);
                    setNumbers(next);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setAssigning(false);
                  }
                }}
              >
                {assigning ? t("numbersAssigning", "Assigning...") : t("assign", "Assign")}
              </button>
              <button
                className="ghost"
                disabled={assigning}
                onClick={async () => {
                  if (!session) return;
                  setAssigning(true);
                  setError(null);
                  try {
                    await unassignNumber(session, assignForm.e164);
                    const next = await listNumbers(session);
                    setNumbers(next);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setAssigning(false);
                  }
                }}
              >
                {t("unassign", "Unassign")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ProtectedShell>
  );
}
