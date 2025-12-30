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
  const [parseError, setParseError] = useState<string | null>(null);
  const [diffSummary, setDiffSummary] = useState<string | null>(null);
  if (!session) return null;

  const safeSession = session as NonNullable<typeof session>;
  const contactsCfg = ((config?.data as any)?.contacts ?? {}) as {
    enabled?: boolean;
    lastImport?: string;
    last_import?: string;
  };
  const canEdit = hasAtLeast(safeSession.user.role, "admin");

  const jsonPreview = draft || (config ? JSON.stringify(config.data ?? config, null, 2) : "");
  const beforeConfig = config?.data ?? config ?? {};

  async function handleSave() {
    if (!config || !canEdit) return;
    setSaving(true);
    try {
      const parsed = draft ? JSON.parse(draft) : (config.data ?? config);
      setParseError(null);
      await updateConfig(safeSession, { ...config, data: parsed }, etag);
      await refresh();
    } catch (err) {
      setParseError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleDraftChange(next: string) {
    setDraft(next);
    try {
      const parsed = JSON.parse(next);
      setParseError(null);
      const diffKeys = Object.keys(parsed).filter(
        (k) => JSON.stringify((beforeConfig as any)[k]) !== JSON.stringify(parsed[k])
      );
      setDiffSummary(diffKeys.length ? `Changed: ${diffKeys.join(", ")}` : "No changes vs loaded config");
    } catch (err) {
      setParseError((err as Error).message);
      setDiffSummary(null);
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
          <div className="gg-value">{loading ? "Loading..." : (config?.version ?? "—")}</div>
          {error && <div className="login-error">Config load error: {error}</div>}
          <textarea
            className="gg-textarea"
            value={jsonPreview}
            onChange={(e) => handleDraftChange(e.target.value)}
            readOnly={!canEdit}
            rows={12}
          />
          {parseError && <div className="login-error">Draft invalid: {parseError}</div>}
          {diffSummary && !parseError && <div className="muted">{diffSummary}</div>}
          <div className="config-grid">
            <div>
              <div className="gg-label">Auth modes</div>
              <div className="gg-value">{config?.data?.authModes ? JSON.stringify(config.data.authModes) : "—"}</div>
            </div>
            <div>
              <div className="gg-label">Contact sync</div>
              <div className="gg-value">{contactsCfg.enabled ? "Enabled" : "Disabled"}</div>
              <div className="muted">Last import: {contactsCfg.lastImport ?? contactsCfg.last_import ?? "-"}</div>
              <div className="actions">
                <button
                  className="ghost"
                  disabled={loading}
                  onClick={async () => {
                    if (!safeSession) return;
                    try {
                      await toggleContactSync(safeSession, !contactsCfg.enabled);
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
                    if (!safeSession) return;
                    setContactsError(null);
                    try {
                      const data = await fetchContacts(safeSession);
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
                    if (!safeSession) return;
                    setContactsError(null);
                    try {
                      const blob = await exportContacts(safeSession);
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
              <div className="gg-value">{config?.data?.presence ? JSON.stringify(config.data.presence) : "—"}</div>
            </div>
            <div>
              <div className="gg-label">Retention</div>
              <div className="gg-value">{config?.data?.retention ? JSON.stringify(config.data.retention) : "—"}</div>
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
