"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { hasAtLeast } from "../../lib/roles";
import { useConfig } from "../../components/config-provider";
import { updateConfig } from "../../lib/rest";
import { useState } from "react";
import { fetchContacts, exportContacts, toggleContactSync } from "../../lib/rest";

export default function ConfigPage() {
  const { session } = useSession();
  const { config, etag, refresh, loading, error } = useConfig();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [contacts, setContacts] = useState<any[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  if (!session) return null;

  const canEdit = hasAtLeast(session.user.role, "admin");

  const jsonPreview = draft || (config ? JSON.stringify(config.data ?? config, null, 2) : "");

  async function handleSave() {
    if (!config || !canEdit) return;
    setSaving(true);
    try {
      const parsed = draft ? JSON.parse(draft) : config.data ?? config;
      await updateConfig(session, { ...config, data: parsed }, etag);
      await refresh();
    } catch {
      // TODO: surface error toast
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">Config</div>
          <h1 className="gg-title">Central configuration</h1>
          <p className="gg-subtitle">
            Render syncserver/smsgate2/smsrelay3 config sections with validation; live updates on CONFIG_UPDATE.
          </p>
        </div>
        <section className="gg-section">
          <div className="gg-label">Access</div>
          <div className="gg-value">{canEdit ? "Admin edit enabled" : "Read-only for this role"}</div>
        </section>
        <section className="gg-section">
          <div className="gg-label">Config state</div>
          <div className="gg-value">{loading ? "Loading..." : config?.version ?? "—"}</div>
          {error && <div className="login-error">Config load error: {error}</div>}
          <textarea
            className="gg-textarea"
            value={jsonPreview}
            onChange={(e) => setDraft(e.target.value)}
            readOnly={!canEdit}
            rows={12}
          />
          <div className="config-grid">
            <div>
              <div className="gg-label">Auth modes</div>
              <div className="gg-value">
                {config?.data?.authModes ? JSON.stringify(config.data.authModes) : "—"}
              </div>
            </div>
            <div>
              <div className="gg-label">Contact sync</div>
              <div className="gg-value">
                {config?.data?.contacts?.enabled ? "Enabled" : "Disabled"}
              </div>
              <div className="muted">
                Last import: {config?.data?.contacts?.lastImport ?? "—"}
              </div>
              <div className="actions">
                <button
                  className="ghost"
                  disabled={loading}
                  onClick={async () => {
                    if (!session) return;
                    try {
                      await toggleContactSync(session, !config?.data?.contacts?.enabled);
                      await refresh();
                    } catch (err) {
                      setContactsError((err as Error).message);
                    }
                  }}
                >
                  Toggle
                </button>
                <button
                  className="ghost"
                  onClick={async () => {
                    if (!session) return;
                    setContactsError(null);
                    try {
                      const data = await fetchContacts(session);
                      setContacts(data);
                    } catch (err) {
                      setContactsError((err as Error).message);
                    }
                  }}
                >
                  Refresh contacts
                </button>
                <button
                  className="ghost"
                  onClick={async () => {
                    if (!session) return;
                    setContactsError(null);
                    try {
                      const blob = await exportContacts(session);
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "contacts.json";
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch (err) {
                      setContactsError((err as Error).message);
                    }
                  }}
                >
                  Export contacts
                </button>
              </div>
              {contactsError && <div className="login-error">Contacts: {contactsError}</div>}
              {contacts && (
                <details className="diag-block">
                  <summary className="gg-label">Contacts preview ({contacts.length})</summary>
                  <pre className="pairing-pre">{JSON.stringify(contacts.slice(0, 5), null, 2)}</pre>
                </details>
              )}
            </div>
            <div>
              <div className="gg-label">Presence thresholds</div>
              <div className="gg-value">
                {config?.data?.presence ? JSON.stringify(config.data.presence) : "—"}
              </div>
            </div>
            <div>
              <div className="gg-label">Retention</div>
              <div className="gg-value">
                {config?.data?.retention ? JSON.stringify(config.data.retention) : "—"}
              </div>
            </div>
          </div>
          <div className="config-actions">
            <button className="ghost" onClick={refresh} disabled={loading}>
              Refresh
            </button>
            <button className="login-submit" onClick={handleSave} disabled={saving || !canEdit}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </section>
      </div>
    </ProtectedShell>
  );
}
