"use client";

import { useEffect, useMemo, useState } from "react";
import { appConfig, wsUrl } from "../lib/config";
import {
  buildOAuthAuthorizeUrl,
  changePassword,
  loginDomain,
  loginSimple,
  requestPasswordReset,
  type Session
} from "../lib/auth";
import { getInitialLocale, getTranslations } from "../lib/i18n";

type Mode = "oauth" | "simple_signin" | "domain_signin";

type Props = {
  onLogin: (session: Session) => void;
};

export function LoginPanel({ onLogin }: Props) {
  const locale = getInitialLocale();
  const t = useMemo(() => {
    const dict = getTranslations(locale);
    return (key: string, fallback: string) => dict[key] ?? fallback;
  }, [locale]);
  const defaultAdminUser = appConfig.adminDefaults?.username ?? "admin";
  const availableModes = useMemo(
    () => [
      { key: "oauth" as Mode, label: t("loginSsoCta", "Sign in with SSO"), enabled: appConfig.authModes.oauth },
      {
        key: "simple_signin" as Mode,
        label: t("loginPasswordCta", "Username / Password"),
        enabled: appConfig.authModes.simpleSignin
      },
      {
        key: "domain_signin" as Mode,
        label: t("loginDomainCta", "Domain Login"),
        enabled: appConfig.authModes.domainSignin
      }
    ],
    [t]
  );
  const enabledModes = availableModes.filter((m) => m.enabled);
  const preferred = appConfig.primaryAuthMode;
  const initialMode: Mode | null =
    (preferred && enabledModes.find((m) => m.key === preferred)?.key) ?? enabledModes[0]?.key ?? null;
  const [mode, setMode] = useState<Mode | null>(initialMode);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requires2fa, setRequires2fa] = useState(false);
  const [passwordChange, setPasswordChange] = useState<{ token?: string; username: string; mfaCode?: string } | null>(
    null
  );
  const [form, setForm] = useState({
    username: defaultAdminUser,
    password: "",
    domain: "",
    mfaCode: ""
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState<string>(defaultAdminUser);
  const [resetPending, setResetPending] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [offlineReset, setOfflineReset] = useState({ token: "", password: "", confirm: "" });
  const offlineResetEnabled = appConfig.offlineReset?.enabled ?? false;
  const adminDefaultPassword = appConfig.adminDefaults?.password;
  const smtpEnabled = !!appConfig.smtp && (appConfig.smtp.enabled ?? true);
  const allowOfflineAdmin = (appConfig.allowOfflineAdmin ?? false) || process.env.NODE_ENV !== "production";
  const networkErrorHint = t("loginNetworkHint", "Server unreachable. Verify API base URL and network.");
  const genericErrorHint = t("loginErrorHelp", "If this keeps happening, check your connection or contact an admin.");

  function handleSelect(next: Mode | null) {
    setMode(next);
    setError(null);
    setRequires2fa(false);
    setPasswordChange(null);
  }

  async function startOAuth() {
    const redirectUri = window.location.origin + "/login/oauth/callback";
    const url = await buildOAuthAuthorizeUrl(redirectUri);
    window.location.href = url;
  }

  // Auto-select a preferred mode when available
  useEffect(() => {
    if (!mode && initialMode) {
      setMode(initialMode);
    }
  }, [initialMode, mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setPending(true);
    setError(null);
    const offlineAdminUser = defaultAdminUser;
    const offlineAdminPass = adminDefaultPassword;
    const isDefaultAdminCreds =
      allowOfflineAdmin && offlineAdminPass && form.username === offlineAdminUser && form.password === offlineAdminPass;
    if (mode === "simple_signin" && isDefaultAdminCreds) {
      const now = Date.now();
      onLogin({
        accessToken: "offline-admin",
        expiresAt: now + 60 * 60 * 1000,
        user: {
          id: "offline-admin",
          name: "Offline Admin",
          email: form.username,
          role: "admin",
          authMode: "simple_signin"
        }
      });
      setPending(false);
      return;
    }

    try {
      if (mode === "oauth") {
        await startOAuth();
        return;
      }

      const fn = mode === "simple_signin" ? loginSimple : loginDomain;
      const result = await fn(
        form.username,
        form.password,
        mode === "domain_signin" ? form.domain : undefined,
        form.mfaCode
      );

      if (result.error) {
        setError(result.error);
        setRequires2fa(!!result.requires2fa);
        setPending(false);
        return;
      }
      if ((result as any).requiresPasswordChange) {
        setPasswordChange({
          token: (result as any).passwordChangeToken,
          username: form.username,
          mfaCode: form.mfaCode || undefined
        });
        setPending(false);
        return;
      }
      if (result.requires2fa) {
        setRequires2fa(true);
        setPending(false);
        return;
      }
      if (result.session) {
        onLogin(result.session);
      }
    } catch (err) {
      const message = (err as Error).message ?? "";
      const lower = message.toLowerCase();
      const isNetworkError =
        lower.includes("network") ||
        lower.includes("fetch") ||
        lower.includes("timeout") ||
        lower.includes("failed to fetch") ||
        message === "";
      if (mode === "simple_signin" && isNetworkError && allowOfflineAdmin && isDefaultAdminCreds) {
        const now = Date.now();
        const fallbackSession: Session = {
          accessToken: "offline-admin",
          expiresAt: now + 60 * 60 * 1000,
          user: {
            id: "offline-admin",
            name: "Offline Admin",
            email: form.username,
            role: "admin",
            authMode: "simple_signin"
          }
        };
        onLogin(fallbackSession);
        setError(null);
        setPending(false);
        return;
      }
      setError(
        isNetworkError ? t("networkFetchError", "Network error when attempting to fetch resource.") : message
      );
    } finally {
      setPending(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordChange) return;
    if (newPassword !== confirmPassword) {
      setError(t("passwordsMismatch", "Passwords do not match"));
      return;
    }
    setPending(true);
    setError(null);
    const payload = {
      token: passwordChange.token,
      username: passwordChange.username,
      currentPassword: form.password,
      newPassword,
      mfaCode: passwordChange.mfaCode
    };
    try {
      const res = await changePassword(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.requiresPasswordChange) {
        setError(t("passwordChangeStillRequired", "Password change still required"));
        return;
      }
      if (res.session) {
        onLogin(res.session);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  async function handleOfflineReset(e: React.FormEvent) {
    e.preventDefault();
    if (!offlineReset.token || !offlineReset.password) {
      setError(t("offlineResetRequired", "Reset token and new password are required"));
      return;
    }
    if (offlineReset.password !== offlineReset.confirm) {
      setError(t("passwordsMismatch", "Passwords do not match"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await changePassword({
        token: offlineReset.token,
        username: form.username || defaultAdminUser,
        newPassword: offlineReset.password,
        mfaCode: form.mfaCode || undefined
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.session) onLogin(res.session);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-panel">
      <div className="muted small">{t("loginChooseMode", "Select a sign-in option available for your tenant.")}</div>
      <div className="form-row">
        <label className="gg-label" htmlFor="mode-select">
          {t("loginModeLabel", "Sign-in method")}
        </label>
        <select
          id="mode-select"
          className="gg-select"
          value={mode ?? "__none__"}
          onChange={(e) => {
            const val = e.target.value;
            handleSelect(val === "__none__" ? null : (val as Mode));
          }}
        >
          {enabledModes.length === 0 && <option value="__none__">{t("loginNoModes", "No auth modes enabled")}</option>}
          {enabledModes.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {passwordChange && (
        <form className="login-form" onSubmit={handlePasswordChange}>
          <div className="form-row">
            <label htmlFor="new-password">{t("loginNewPassword", "New password")}</label>
            <input
              id="new-password"
              required
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t("loginUpdateDefault", "Update default/admin password")}
            />
          </div>
          <div className="form-row">
            <label htmlFor="confirm-password">{t("loginConfirmPassword", "Confirm password")}</label>
            <input
              id="confirm-password"
              required
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? t("saving", "Saving...") : t("loginSavePassword", "Save new password")}
          </button>
          <div className="muted small">
            {t("loginResetNote", "Required on first login or when policy forces a reset.")}
          </div>
        </form>
      )}

      {!passwordChange && mode === "oauth" && (
        <div className="login-help">
          <p>{t("loginSsoReady", "Continue to your identity provider to sign in.")}</p>
          <button
            type="button"
            className="login-submit"
            disabled={pending}
            onClick={() => {
              void startOAuth();
            }}
          >
            {pending ? t("loginSubmitting", "Signing in...") : t("loginSsoCta", "Sign in with SSO")}
          </button>
        </div>
      )}

      {!passwordChange && mode && mode !== "oauth" && (
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="username">{t("loginUsername", "Username")}</label>
            <input
              id="username"
              required
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          {mode === "domain_signin" && (
            <div className="form-row">
              <label htmlFor="domain">{t("loginDomainOptional", "Domain (optional)")}</label>
              <input id="domain" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
              <div className="muted small">
                {t("loginDomainPlaceholder", "Enter your AD/LDAP domain (e.g., corp.local)")}
              </div>
            </div>
          )}
          <div className="form-row">
            <label htmlFor="password">{t("loginPassword", "Password")}</label>
            <input
              id="password"
              required
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {requires2fa && (
            <div className="form-row">
              <label htmlFor="mfa">{t("loginMfa", "MFA code")}</label>
              <input
                id="mfa"
                required
                value={form.mfaCode}
                onChange={(e) => setForm({ ...form, mfaCode: e.target.value })}
              />
            </div>
          )}
          <button type="submit" className="login-submit" disabled={pending}>
            {pending ? t("loginSubmitting", "Signing in...") : t("loginSubmit", "Sign in")}
          </button>
        </form>
      )}

      {mode === "oauth" && (
        <div className="login-help">
          Redirecting to identity provider. If nothing happens, ensure API base is reachable:
          <div className="gg-value">{appConfig.apiBaseUrl}</div>
        </div>
      )}

      <div className="login-help">
        <button type="button" className="ghost" onClick={() => setResetOpen((v) => !v)}>
          {resetOpen ? t("loginResetHide", "Hide password reset") : t("loginResetShow", "Need a password reset?")}
        </button>
        {resetOpen && (
          <>
            <div className="form-row">
              <label htmlFor="reset-email">{t("loginResetEmail", "Password reset email")}</label>
              <div className="reset-row">
                <input
                  id="reset-email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder={t("loginResetPlaceholder", "user@example.com")}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={resetPending || !smtpEnabled}
                  onClick={async () => {
                    setResetStatus(null);
                    setResetPending(true);
                    const res = await requestPasswordReset(resetEmail);
                    setResetStatus(
                      res.ok ? t("resetLinkSent", "Reset link sent") : (res.message ?? t("resetFailed", "Reset failed"))
                    );
                    setResetPending(false);
                  }}
                >
                  {resetPending ? t("saving", "Saving...") : t("sendResetLink", "Send reset link")}
                </button>
              </div>
              {!smtpEnabled && (
                <div className="muted small warning">
                  {t(
                    "smtpDisabled",
                    "SMTP is disabled in configuration; use offline reset or contact an administrator."
                  )}
                </div>
              )}
              {resetStatus && <div className="muted small">{resetStatus}</div>}
            </div>
            {offlineResetEnabled && (
              <details>
                <summary className="ghost">{t("offlineResetCta", "Reset without email")}</summary>
                <div className="form-row">
                  <label htmlFor="offline-reset">{t("loginOfflineReset", "Offline reset (token)")}</label>
                  <input
                    id="offline-reset"
                    value={offlineReset.token}
                    onChange={(e) => setOfflineReset((prev) => ({ ...prev, token: e.target.value }))}
                  />
                  <input
                    type="password"
                    value={offlineReset.password}
                    onChange={(e) => setOfflineReset((prev) => ({ ...prev, password: e.target.value }))}
                  />
                  <input
                    type="password"
                    value={offlineReset.confirm}
                    onChange={(e) => setOfflineReset((prev) => ({ ...prev, confirm: e.target.value }))}
                  />
                  <button type="button" className="ghost" disabled={pending} onClick={handleOfflineReset}>
                    {t("offlineResetCta", "Reset without email")}
                  </button>
                  <div className="muted small">
                    {t(
                      "offlineResetHelp",
                      "Use when SMTP is unavailable. Token can come from admin CLI or manual backend reset. New password must meet your policy."
                    )}
                  </div>
                </div>
              </details>
            )}
          </>
        )}
      </div>
      {error && (
        <div className="login-error">
          {t("errorPrefix", "Error")}: {error}
          <div className="muted small">
            {error?.toLowerCase().includes("network") || error?.toLowerCase().includes("fetch")
              ? networkErrorHint
              : genericErrorHint}
          </div>
        </div>
      )}
      <div className="login-foot">
        <div className="muted small">
          {t("loginWsEndpoint", "WS Endpoint")}: {wsUrl()}
        </div>
        <div className="muted small">{t("loginTokensStored", "Tokens stored locally; logout clears them.")}</div>
      </div>
    </div>
  );
}
