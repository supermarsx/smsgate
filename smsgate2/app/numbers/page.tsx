"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useEffect, useState } from "react";
import { assignNumber, createNumber, listNumbers, unassignNumber } from "../../lib/rest";

export default function NumbersPage() {
  const { session } = useSession();
  const [numbers, setNumbers] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [form, setForm] = useState({ e164: "", label: "" });
  const [assignForm, setAssignForm] = useState({ e164: "", userId: "", deviceId: "" });
  if (!session) return null;

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
        <div className="gg-section">
          <h3 className="gg-section__title">Add number</h3>
          <div className="filter-row">
            <label className="gg-label" htmlFor="num-e164">E.164</label>
            <input
              id="num-e164"
              className="gg-input"
              value={form.e164}
              onChange={(e) => setForm({ ...form, e164: e.target.value })}
              placeholder="+15551234567"
            />
            <label className="gg-label" htmlFor="num-label">Label</label>
            <input
              id="num-label"
              className="gg-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="SIM slot or nickname"
            />
            <button
              className="login-submit"
              disabled={creating}
              onClick={async () => {
                if (!session) return;
                if (!validateE164(form.e164)) {
                  setError("Enter a valid E.164 number");
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
              {creating ? "Adding..." : "Add number"}
            </button>
          </div>
        </div>
        <div className="gg-section">
          <h3 className="gg-section__title">Assign/unassign</h3>
          <div className="filter-row">
            <label className="gg-label" htmlFor="assign-e164">E.164</label>
            <input
              id="assign-e164"
              className="gg-input"
              value={assignForm.e164}
              onChange={(e) => setAssignForm({ ...assignForm, e164: e.target.value })}
            />
            <label className="gg-label" htmlFor="assign-user">User ID</label>
            <input
              id="assign-user"
              className="gg-input"
              value={assignForm.userId}
              onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}
              placeholder="optional"
            />
            <label className="gg-label" htmlFor="assign-device">Device ID</label>
            <input
              id="assign-device"
              className="gg-input"
              value={assignForm.deviceId}
              onChange={(e) => setAssignForm({ ...assignForm, deviceId: e.target.value })}
              placeholder="optional"
            />
            <div className="actions">
              <button
                className="login-submit"
                disabled={assigning}
                onClick={async () => {
                  if (!session) return;
                  if (!validateE164(assignForm.e164)) {
                    setError("Enter a valid E.164 number to assign");
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
                {assigning ? "Assigning..." : "Assign"}
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
                Unassign
              </button>
            </div>
          </div>
        </div>
      </div>
    </ProtectedShell>
  );
}
