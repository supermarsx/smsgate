"use client";

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { hasAtLeast } from "../../lib/roles";
import { useConfig } from "../../components/config-provider";
import { updateConfig } from "../../lib/rest";
import { useMemo, useState } from "react";
import { fetchContacts, exportContacts, toggleContactSync } from "../../lib/rest";
import { getInitialLocale, getTranslations } from "../../lib/i18n";

export default function ConfigPage() {
  const { session } = useSession();
  const { config, etag, refresh, loading, error } = useConfig();
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [contacts, setContacts] = useState<any[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [diffSummary, setDiffSummary] = useState<string | null>(null);
  const [shapeErrors, setShapeErrors] = useState<string[]>([]);
  const locale = getInitialLocale();
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
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

  function validateShape(parsed: any): string[] {
    const issues: string[] = [];
    if (!parsed || typeof parsed !== "object") issues.push("Config must be a JSON object");
    if (!parsed.authModes || typeof parsed.authModes !== "object") issues.push("authModes missing");
    if (parsed.authModes) {
      ["oauth", "simpleSignin", "domainSignin"].forEach((key) => {
        if (typeof parsed.authModes[key] !== "boolean") issues.push(`authModes.${key} must be boolean`);
      });
    }
    if (!parsed.presence || typeof parsed.presence !== "object") issues.push("presence thresholds missing");
    if (!parsed.retention || typeof parsed.retention !== "object") issues.push("retention missing");
    if (parsed.roles && !Array.isArray(parsed.roles.order)) issues.push("roles.order must be an array when provided");
    return issues;
  }

  async function handleSave() {
    if (!config || !canEdit) return;
    setSaving(true);
    try {
      const parsed = draft ? JSON.parse(draft) : (config.data ?? config);
      setParseError(null);
      const shapeIssues = validateShape(parsed);
      setShapeErrors(shapeIssues);
      if (shapeIssues.length) {
        throw new Error("Config shape invalid");
      }
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
      const shapeIssues = validateShape(parsed);
      setShapeErrors(shapeIssues);
      const diffKeys = Object.keys(parsed).filter(
        (k) => JSON.stringify((beforeConfig as any)[k]) !== JSON.stringify(parsed[k])
      );
      setDiffSummary(
        diffKeys.length
          ? `${t("configChangedKeys", "Changed")}: ${diffKeys.join(", ")}`
          : t("configNoChanges", "No changes vs loaded config")
      );
    } catch (err) {
      setParseError((err as Error).message);
      setDiffSummary(null);
      setShapeErrors([]);
    }
  }

  return (
    <ProtectedShell>
      <div className="gg-panel">
        <div className="gg-panel__header">
          <div className="gg-pill">{t("configTitle", "Config")}</div>
          <h1 className="gg-title">{t("configSubtitle", "Central configuration")}</h1>
          <p className="gg-subtitle">
            {t(
              "configLead",
              "Render syncserver/smsgate2/smsrelay3 config sections with validation; live updates on CONFIG_UPDATE."
            )}
          </p>
        </div>
        <section className="gg-section">
          <div className="gg-label">{t("configAccessLabel", "Access")}</div>
          <div className="gg-value">
            {canEdit ? t("configEditEnabled", "Admin edit enabled") : t("configReadOnly", "Read-only for this role")}
          </div>
        </section>
        <section className="gg-section">
          <div className="gg-label">{t("configStateLabel", "Config state")}</div>
          <div className="gg-value">{loading ? t("loading", "Loading...") : (config?.version ?? "—")}</div>
          {error && (
            <div className="login-error">
              {t("configLoadError", "Config load error")}: {error}
            </div>
          )}
          <textarea
            className="gg-textarea"
            value={jsonPreview}
            onChange={(e) => handleDraftChange(e.target.value)}
            readOnly={!canEdit}
            rows={12}
          />
          {parseError && (
            <div className="login-error">
              {t("configDraftInvalid", "Draft invalid")}: {parseError}
            </div>
          )}
          {shapeErrors.length > 0 && !parseError && (
            <div className="login-error">
              {t("configShapeIssues", "Config shape issues")}:
              <ul>
                {shapeErrors.map((err) => (
                  <li key={err}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          {diffSummary && !parseError && <div className="muted">{diffSummary}</div>}
          <div className="config-grid">
            <div>
              <div className="gg-label">{t("configAuthModesLabel", "Auth modes")}</div>
              <div className="gg-value">{config?.data?.authModes ? JSON.stringify(config.data.authModes) : "—"}</div>
            </div>
            <div>
              <div className="gg-label">{t("configContactSync", "Contact sync")}</div>
              <div className="gg-value">{contactsCfg.enabled ? t("statusEnabled", "Enabled") : t("statusDisabled", "Disabled")}</div>
              <div className="muted">
                {t("configLastImportLabel", "Last import")}: {contactsCfg.lastImport ?? contactsCfg.last_import ?? "-"}
              </div>
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
                  {contactsCfg.enabled
                    ? t("contactsDisableSync", "Disable sync")
                    : t("contactsEnableSync", "Enable sync")}
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
                  {t("contactsRefresh", "Refresh contacts")}
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
                  {t("contactsExport", "Export contacts")}
                </button>
              </div>
              {contactsError && (
                <div className="login-error">
                  {t("contactsError", "Contacts")}: {contactsError}
                </div>
              )}
              {contacts && (
                <details className="diag-block">
                  <summary className="gg-label">
                    {t("configContactsPreview", "Contacts preview")} ({contacts.length})
                  </summary>
                  <pre className="pairing-pre">{JSON.stringify(contacts.slice(0, 5), null, 2)}</pre>
                </details>
              )}
            </div>
            <div>
              <div className="gg-label">{t("configPresence", "Presence thresholds")}</div>
              <div className="gg-value">{config?.data?.presence ? JSON.stringify(config.data.presence) : "—"}</div>
            </div>
            <div>
              <div className="gg-label">{t("configRetention", "Retention")}</div>
              <div className="gg-value">{config?.data?.retention ? JSON.stringify(config.data.retention) : "—"}</div>
            </div>
          </div>
          <div className="config-actions">
            <button className="ghost" onClick={refresh} disabled={loading}>
              {t("refresh", "Refresh")}
            </button>
            <button className="login-submit" onClick={handleSave} disabled={saving || !canEdit}>
              {saving ? t("configSaving", "Saving...") : t("save", "Save")}
            </button>
          </div>
        </section>
      </div>
    </ProtectedShell>
  );
}
