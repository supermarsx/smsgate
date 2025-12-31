"use client";

/**
 * @fileoverview Config editor with validation, diff preview, and contact utilities.
 */

import { ProtectedShell } from "../../components/protected-shell";
import { useSession } from "../../components/session-provider";
import { hasAtLeast } from "../../lib/roles";
import { useConfig } from "../../components/config-provider";
import { updateConfig } from "../../lib/rest";
import { useMemo, useState } from "react";
import { fetchContacts, exportContacts, toggleContactSync } from "../../lib/rest";
import { getTranslations, useLocale } from "../../lib/i18n";
import { validateConfigShape } from "../../lib/config-validators";

/**
 * Configuration editor with validation, diff preview, and contact utilities.
 * @returns Config page element.
 */
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
  const [authModesDraft, setAuthModesDraft] = useState<{
    oauth: boolean;
    simpleSignin: boolean;
    domainSignin: boolean;
  } | null>(null);
  const [rolesDraft, setRolesDraft] = useState<{ order?: string[]; labels?: Record<string, string> } | null>(null);
  const [wsDraft, setWsDraft] = useState<{
    snapshotSize?: number;
    pingMs?: number;
    pageSize?: number;
    maxConnections?: number;
  } | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<Record<string, unknown> | null>(null);
  const [relayDraft, setRelayDraft] = useState<Record<string, unknown> | null>(null);
  const [contactsDraft, setContactsDraft] = useState<Record<string, unknown> | null>(null);
  const locale = useLocale();
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

  function handleDraftChange(next: string) {
    setDraft(next);
    try {
      const parsed = JSON.parse(next);
      setParseError(null);
      const shapeIssues = validateConfigShape(parsed as any);
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
          <div className="gg-section__title">{t("configSections", "Sections")}</div>
          <div className="config-grid">
            <div>
              <div className="gg-label" title={t("configAuthHelp", "Toggle auth methods available to users")}>
                {t("configAuthModesLabel", "Auth modes")}
              </div>
              <div className="config-fields">
                {(["oauth", "simpleSignin", "domainSignin"] as const).map((key) => (
                  <label key={key} className="checkbox-row" title={key}>
                    <input
                      type="checkbox"
                      checked={(authModesDraft ?? (beforeConfig as any).authModes ?? {})[key] ?? false}
                      disabled={!canEdit}
                      onChange={(e) => {
                        setAuthModesDraft((prev) => ({
                          ...(prev ?? (beforeConfig as any).authModes ?? {}),
                          [key]: e.target.checked
                        }));
                        setDraft("");
                      }}
                    />
                    <span>{key}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div
                className="gg-label"
                title={t("configRbacHelp", "Role order controls precedence; labels shown in UI")}
              >
                {t("configRbac", "RBAC mapping")}
              </div>
              <div className="helper-text">{t("configRbacOrder", "Role order and labels")}</div>
              <input
                className="gg-input"
                aria-label={t("configRbacOrder", "Role order and labels")}
                disabled={!canEdit}
                defaultValue={((beforeConfig as any).roles?.order ?? []).join(",")}
                onBlur={(e) => {
                  setRolesDraft((prev) => ({
                    ...(prev ?? {}),
                    order: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  }));
                  setDraft("");
                }}
                placeholder="viewer,verifier,manager,admin"
              />
            </div>
            <div>
              <div className="gg-label" title={t("configWsHelp", "WS/backfill, presence and paging knobs")}>
                {t("configWs", "Realtime & WS")}
              </div>
              <div className="config-fields">
                <label className="gg-label">{t("configSnapshot", "Snapshot size")}</label>
                <input
                  className="gg-input"
                  type="number"
                  disabled={!canEdit}
                  defaultValue={(beforeConfig as any).presence?.snapshotSize ?? 10}
                  onBlur={(e) => {
                    setWsDraft((prev) => ({ ...(prev ?? {}), snapshotSize: Number(e.target.value) }));
                    setDraft("");
                  }}
                />
                <label className="gg-label">{t("configPing", "WS ping ms")}</label>
                <input
                  className="gg-input"
                  type="number"
                  disabled={!canEdit}
                  defaultValue={(beforeConfig as any).presence?.pingMs ?? 15000}
                  onBlur={(e) => {
                    setWsDraft((prev) => ({ ...(prev ?? {}), pingMs: Number(e.target.value) }));
                    setDraft("");
                  }}
                />
              </div>
            </div>
            <div>
              <div className="gg-label" title={t("configRetentionHelp", "Redis TTLs / DB persistence knobs")}>
                {t("configRetention", "Retention")}
              </div>
              <textarea
                className="gg-textarea"
                aria-label={t("configRetention", "Retention")}
                disabled={!canEdit}
                defaultValue={JSON.stringify((beforeConfig as any).retention ?? {}, null, 2)}
                onBlur={(e) => {
                  try {
                    setRetentionDraft(JSON.parse(e.target.value));
                    setParseError(null);
                  } catch (err) {
                    setParseError((err as Error).message);
                  }
                  setDraft("");
                }}
              />
            </div>
            <div>
              <div className="gg-label" title={t("configRelayHelp", "Heartbeat, retry, queue, ingest policies")}>
                {t("configRelay", "smsrelay3 policies")}
              </div>
              <textarea
                className="gg-textarea"
                aria-label={t("configRelay", "smsrelay3 policies")}
                disabled={!canEdit}
                defaultValue={JSON.stringify(
                  (beforeConfig as any).relay ?? (beforeConfig as any).smsrelay3 ?? {},
                  null,
                  2
                )}
                onBlur={(e) => {
                  try {
                    setRelayDraft(JSON.parse(e.target.value));
                    setParseError(null);
                  } catch (err) {
                    setParseError((err as Error).message);
                  }
                  setDraft("");
                }}
              />
            </div>
            <div>
              <div
                className="gg-label"
                title={t("configContactHelp", "Contact sync enable/interval/conflict policies")}
              >
                {t("configContact", "Contact sync")}
              </div>
              <textarea
                className="gg-textarea"
                aria-label={t("configContact", "Contact sync")}
                disabled={!canEdit}
                defaultValue={JSON.stringify((beforeConfig as any).contacts ?? {}, null, 2)}
                onBlur={(e) => {
                  try {
                    setContactsDraft(JSON.parse(e.target.value));
                    setParseError(null);
                  } catch (err) {
                    setParseError((err as Error).message);
                  }
                  setDraft("");
                }}
              />
            </div>
          </div>
        </section>
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
            aria-label={t("configRawJson", "Raw config JSON")}
            aria-invalid={parseError ? "true" : "false"}
            aria-describedby={parseError ? "config-errors" : undefined}
            rows={12}
          />
          {parseError && (
            <div className="login-error" role="alert" id="config-errors">
              {t("configDraftInvalid", "Draft invalid")}: {parseError}
            </div>
          )}
          {shapeErrors.length > 0 && !parseError && (
            <div className="login-error" role="alert" id="config-shape-errors">
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
              <div className="gg-value">
                {contactsCfg.enabled ? t("statusEnabled", "Enabled") : t("statusDisabled", "Disabled")}
              </div>
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
            <button
              className="login-submit"
              onClick={async () => {
                if (!config || !canEdit) return;
                setSaving(true);
                try {
                  const base = config.data ?? config;
                  const merged = {
                    ...base,
                    ...(authModesDraft ? { authModes: authModesDraft } : {}),
                    ...(rolesDraft ? { roles: { ...(base as any).roles, ...rolesDraft } } : {}),
                    ...(wsDraft ? { presence: { ...(base as any).presence, ...wsDraft } } : {}),
                    ...(retentionDraft ? { retention: retentionDraft } : {}),
                    ...(relayDraft ? { relay: relayDraft } : {}),
                    ...(contactsDraft ? { contacts: contactsDraft } : {})
                  } as any;
                  const shapeIssues = validateConfigShape(merged);
                  setShapeErrors(shapeIssues);
                  if (shapeIssues.length) throw new Error("Config shape invalid");
                  await updateConfig(safeSession, { ...config, data: merged }, etag);
                  await refresh();
                  setAuthModesDraft(null);
                  setRolesDraft(null);
                  setWsDraft(null);
                  setRetentionDraft(null);
                  setRelayDraft(null);
                  setContactsDraft(null);
                  setDraft("");
                  setParseError(null);
                } catch (err) {
                  setParseError((err as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving || !canEdit}
            >
              {saving ? t("configSaving", "Saving...") : t("save", "Save")}
            </button>
          </div>
        </section>
      </div>
    </ProtectedShell>
  );
}
