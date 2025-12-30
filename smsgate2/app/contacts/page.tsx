"use client";

import { useState } from "react";
import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { useConfig } from "../../components/config-provider";
import { exportContacts, fetchContacts, resolveContactConflict, toggleContactSync } from "../../lib/rest";
import { hasAtLeast } from "../../lib/roles";

type ContactRecord = Record<string, unknown>;

export default function ContactsPage() {
  const { session } = useSession();
  const { config, refresh, loading: configLoading } = useConfig();
  const [contacts, setContacts] = useState<ContactRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<string>("idle");
  if (!session) return null;

  const safeSession = session as NonNullable<typeof session>;
  const contactsCfg = ((config?.data as any)?.contacts ?? {}) as {
    enabled?: boolean;
    lastImport?: string;
    last_import?: string;
  };
  const enabled = Boolean(contactsCfg.enabled);
  const canToggle = hasAtLeast(safeSession.user.role, "manager");
  const total = contacts?.length ?? 0;
  const conflicts = (contacts ?? []).filter((c) => {
    const conflict = (c as any).conflict || (c as any).conflictReason || (c as any).conflict_reason;
    const conflictsArr = (c as any).conflicts;
    const duplicates = (c as any).duplicates || (c as any).duplicate;
    return Boolean(conflict) || (Array.isArray(conflictsArr) && conflictsArr.length > 0) || Boolean(duplicates);
  });

  async function handleToggle() {
    if (!safeSession || !canToggle) return;
    setError(null);
    setLoading(true);
    try {
      await toggleContactSync(safeSession, !enabled);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    if (!safeSession) return;
    setError(null);
    setLoading(true);
    try {
      const data = await fetchContacts(safeSession);
      setContacts(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    if (!safeSession) return;
    setError(null);
    setLoading(true);
    try {
      const blob = await exportContacts(safeSession);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "contacts.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResolve(conflict: any, resolution: string) {
    if (!safeSession) return;
    setError(null);
    setLoading(true);
    const conflictId = conflict.id ?? conflict.conflictId ?? conflict.number ?? String(Math.random());
    try {
      await resolveContactConflict(safeSession, conflictId, resolution);
      await handleRefresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function pollImport() {
    setImportStatus("polling...");
    await handleRefresh();
    setImportStatus("refreshed");
    setTimeout(() => setImportStatus("idle"), 1500);
  }

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Contacts</div>
          <h1 className="gg-title">Contact sync + conflicts</h1>
          <p className="gg-subtitle">
            Toggle contact sync, inspect recent imports, surface conflicts, and export/download mappings.
          </p>
        </div>
        {error && <div className="login-error">Error: {error}</div>}
        <section className="gg-section">
          <div className="contact-grid">
            <div>
              <div className="gg-label">Status</div>
              <div className="gg-value">{enabled ? "Enabled" : "Disabled"}</div>
              <div className="muted small">Last import: {contactsCfg.lastImport ?? contactsCfg.last_import ?? "-"}</div>
            </div>
            <div>
              <div className="gg-label">Counts</div>
              <div className="gg-value">{total ? `${total} contacts` : "No contacts loaded"}</div>
              <div className="muted small">
                Conflicts: {conflicts.length} {conflicts.length ? "(first 5 shown)" : ""}
              </div>
            </div>
            <div>
              <div className="gg-label">Role</div>
              <div className="gg-value">{session.user.role}</div>
              <div className="muted small">Managers/Admins can toggle and export</div>
            </div>
          </div>
          <div className="config-actions">
            <button className="ghost" disabled={loading || !canToggle || configLoading} onClick={handleToggle}>
              {enabled ? "Disable sync" : "Enable sync"}
            </button>
            <button className="ghost" disabled={loading} onClick={handleRefresh}>
              Refresh contacts
            </button>
            <button className="ghost" disabled={loading} onClick={pollImport}>
              Poll import status
            </button>
            <button className="login-submit" disabled={loading} onClick={handleExport}>
              Export JSON
            </button>
            {importStatus !== "idle" && <span className="muted small">{importStatus}</span>}
          </div>
        </section>
        {contacts && (
          <section className="gg-section">
            <div className="gg-label">
              Contacts preview ({Math.min(contacts.length, 5)} of {contacts.length})
            </div>
            <pre className="pairing-pre">{JSON.stringify(contacts.slice(0, 5), null, 2)}</pre>
          </section>
        )}
        {conflicts.length > 0 && (
          <section className="gg-section">
            <div className="gg-label">Conflicts ({conflicts.length})</div>
            <div className="conflict-list">
              {conflicts.slice(0, 5).map((c, idx) => (
                <div key={idx} className="conflict-card">
                  <div className="gg-value">Entry {idx + 1}</div>
                  <div className="muted small">Source: {(c as any).source ?? "-"}</div>
                  <pre className="pairing-pre">{JSON.stringify(c, null, 2)}</pre>
                  <div className="actions">
                    <button className="ghost" onClick={() => handleResolve(c, "server")}>
                      Keep server
                    </button>
                    <button className="ghost" onClick={() => handleResolve(c, "client")}>
                      Keep client
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ProtectedShell>
  );
}
