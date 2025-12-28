"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { hasAtLeast } from "../../lib/roles";
import { useConfig } from "../../components/config-provider";
import { updateConfig } from "../../lib/rest";
import { useState } from "react";

export default function ConfigPage() {
  const { session } = useSession();
  const { config, etag, refresh, loading, error } = useConfig();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string>("");
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
